import { prisma } from "../lib/prisma.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { decimalToNumber, toDecimal, ZERO_DECIMAL } from "../utils/decimal.js";
import { currencyField, toApiDispatchStatus, toApiQuotePackageStatus } from "../utils/presentation.js";
import { recordAuditLog } from "./auditService.js";
import { reconcileQuoteRequestAlert } from "./alertEngineService.js";

async function getBestQuoteForSku(tx, skuId) {
  const quotes = await tx.supplierQuote.findMany({
    where: {
      skuId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    include: {
      supplier: true,
    },
    orderBy: {
      unitPrice: "asc",
    },
    take: 1,
  });

  return quotes[0] ?? null;
}

function estimateLineSaving(line) {
  if (line.currentBestQuote == null || line.targetUnitPrice == null || line.quantity == null) {
    return ZERO_DECIMAL;
  }

  const delta = toDecimal(line.currentBestQuote).minus(toDecimal(line.targetUnitPrice));
  return delta.greaterThan(0) ? delta.mul(toDecimal(line.quantity)) : ZERO_DECIMAL;
}

async function mapPackage(tx, quotePackage) {
  const supplierIds = Array.isArray(quotePackage.recipientSupplierIds)
    ? quotePackage.recipientSupplierIds
    : quotePackage.recipientSupplierIds ?? [];
  const recipients = supplierIds.length
    ? await tx.supplier.findMany({
        where: {
          id: { in: supplierIds },
        },
      })
    : [];

  return {
    id: quotePackage.id,
    title: quotePackage.title,
    message: quotePackage.message,
    status: toApiQuotePackageStatus(quotePackage.status),
    scheduleAt: quotePackage.scheduleAt?.toISOString() ?? null,
    currency: quotePackage.currency,
    totalAmount: currencyField(quotePackage.totalAmount),
    estimatedSaving: currencyField(quotePackage.estimatedSaving),
    createdAt: quotePackage.createdAt.toISOString(),
    updatedAt: quotePackage.updatedAt.toISOString(),
    submittedAt: quotePackage.submittedAt?.toISOString() ?? null,
    approvedAt: quotePackage.approvedAt?.toISOString() ?? null,
    dispatchedAt: quotePackage.dispatchedAt?.toISOString() ?? null,
    source: {
      alertId: quotePackage.sourceAlertId,
      skuId: quotePackage.sourceSkuId,
    },
    recipients: recipients.map((supplier) => ({
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
    })),
    lines: quotePackage.lines.map((line) => ({
      id: line.id,
      quantity: Number(line.quantity),
      note: line.note,
      currentBestQuote: currencyField(line.currentBestQuote),
      targetUnitPrice: currencyField(line.targetUnitPrice),
      estimatedSaving: currencyField(line.estimatedSaving),
      sku: {
        id: line.sku.id,
        code: line.sku.code,
        name: line.sku.name,
        category: line.sku.category,
      },
      supplier: line.preferredSupplier
        ? {
            id: line.preferredSupplier.id,
            code: line.preferredSupplier.code,
            name: line.preferredSupplier.name,
          }
        : null,
      sourceAlertId: line.alertId,
    })),
    approvals: quotePackage.approvals.map((approval) => ({
      id: approval.id,
      stepOrder: approval.stepOrder,
      label: approval.label,
      requiredRole: approval.roleRequired.toLowerCase(),
      status: approval.status.toLowerCase(),
      comment: approval.comment,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      assignedUser: approval.assignedUser
        ? {
            id: approval.assignedUser.id,
            name: approval.assignedUser.name,
            role: approval.assignedUser.role.toLowerCase(),
          }
        : null,
    })),
    dispatches: quotePackage.dispatches.map((dispatch) => ({
      id: dispatch.id,
      status: toApiDispatchStatus(dispatch.status),
      recordedAt: dispatch.recordedAt.toISOString(),
      scheduledAt: dispatch.scheduledAt?.toISOString() ?? null,
      notes: dispatch.notes,
    })),
  };
}

async function calculatePackageAmounts(lines) {
  return lines.reduce(
    (accumulator, line) => {
      const unitPrice = line.targetUnitPrice ?? line.currentBestQuote ?? ZERO_DECIMAL;
      const quantity = line.quantity ?? 1;
      const lineTotal = toDecimal(unitPrice).mul(toDecimal(quantity));
      const lineSaving = line.estimatedSaving ?? estimateLineSaving(line);

      return {
        totalAmount: accumulator.totalAmount.plus(lineTotal),
        estimatedSaving: accumulator.estimatedSaving.plus(lineSaving),
      };
    },
    {
      totalAmount: ZERO_DECIMAL,
      estimatedSaving: ZERO_DECIMAL,
    }
  );
}

async function resolveSourceLine(tx, workspaceId, payload) {
  if (payload.fromAlertId) {
    const alert = await tx.alert.findFirst({
      where: {
        workspaceId,
        id: payload.fromAlertId,
      },
      include: {
        sku: true,
      },
    });

    if (!alert?.skuId) {
      throw notFound("Alert source could not be resolved.");
    }

    const bestQuote = await getBestQuoteForSku(tx, alert.skuId);
    return {
      sourceAlertId: alert.id,
      sourceSkuId: alert.skuId,
      line: {
        skuId: alert.skuId,
        alertId: alert.id,
        preferredSupplierId: bestQuote?.supplierId ?? null,
        currentBestQuote: bestQuote?.unitPrice ?? null,
        targetUnitPrice: bestQuote?.unitPrice ?? null,
        estimatedSaving: alert.potentialSaving ?? ZERO_DECIMAL,
        quantity: payload.quantity ?? 1,
      },
      title: `${alert.sku.name} action pack`,
    };
  }

  if (payload.fromSkuId) {
    const sku = await tx.sku.findFirst({
      where: {
        workspaceId,
        id: payload.fromSkuId,
      },
    });

    if (!sku) {
      throw notFound("SKU source could not be resolved.");
    }

    const bestQuote = await getBestQuoteForSku(tx, sku.id);
    return {
      sourceSkuId: sku.id,
      line: {
        skuId: sku.id,
        preferredSupplierId: bestQuote?.supplierId ?? null,
        currentBestQuote: bestQuote?.unitPrice ?? null,
        targetUnitPrice: bestQuote?.unitPrice ?? null,
        quantity: payload.quantity ?? 1,
      },
      title: `${sku.name} action pack`,
    };
  }

  return null;
}

async function buildApprovalSteps(tx, workspaceId, quotePackageId, totalAmount, categories) {
  const [rules, users] = await Promise.all([
    tx.approvalRule.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
      orderBy: {
        stepOrder: "asc",
      },
    }),
    tx.user.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        role: true,
        name: true,
      },
    }),
  ]);

  const matchedRules = rules.filter((rule) => {
    const categoryMatch = rule.category ? categories.includes(rule.category) : true;
    const amountMatch = rule.minPackageAmount
      ? totalAmount.greaterThanOrEqualTo(rule.minPackageAmount)
      : true;
    return categoryMatch && amountMatch;
  });

  const effectiveRules =
    matchedRules.length > 0
      ? matchedRules
      : [
          {
            id: null,
            name: "Default approval",
            requiredRole: "APPROVER",
            stepOrder: 1,
          },
        ];

  return Promise.all(
    effectiveRules.map((rule, index) =>
      tx.quotePackageApproval.create({
        data: {
          quotePackageId,
          ruleId: rule.id,
          stepOrder: rule.stepOrder ?? index + 1,
          roleRequired: rule.requiredRole,
          label: rule.name,
          assignedUserId: users.find((user) => user.role === rule.requiredRole)?.id ?? null,
        },
      })
    )
  );
}

function normalizeRecipientIds(value) {
  if (!value) {
    return [];
  }

  const normalized = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      normalized
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );
}

export async function createQuotePackage(workspaceId, actorUser, payload) {
  return prisma.$transaction(async (tx) => {
    const sourced = await resolveSourceLine(tx, workspaceId, payload);
    const packageTitle = payload.title || sourced?.title || "New quote package";
    const recipientIds = normalizeRecipientIds(payload.recipientSupplierIds ?? []);
    const created = await tx.quotePackage.create({
      data: {
        workspaceId,
        createdByUserId: actorUser.id,
        sourceAlertId: sourced?.sourceAlertId ?? null,
        sourceSkuId: sourced?.sourceSkuId ?? null,
        title: packageTitle,
        message: payload.message ?? null,
        scheduleAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null,
        recipientSupplierIds: recipientIds,
      },
    });

    const inputLines = payload.lines?.length ? payload.lines : sourced ? [sourced.line] : [];
    if (!inputLines.length) {
      throw badRequest("A quote package requires at least one line or source.");
    }

    for (const inputLine of inputLines) {
      await tx.quotePackageLine.create({
        data: {
          quotePackageId: created.id,
          skuId: inputLine.skuId,
          alertId: inputLine.alertId ?? null,
          preferredSupplierId: inputLine.preferredSupplierId ?? null,
          quantity: toDecimal(inputLine.quantity ?? 1),
          currentBestQuote: inputLine.currentBestQuote != null ? toDecimal(inputLine.currentBestQuote) : null,
          targetUnitPrice: inputLine.targetUnitPrice != null ? toDecimal(inputLine.targetUnitPrice) : null,
          estimatedSaving:
            inputLine.estimatedSaving != null ? toDecimal(inputLine.estimatedSaving) : ZERO_DECIMAL,
          note: inputLine.note ?? null,
        },
      });
    }

    const createdWithLines = await tx.quotePackage.findUnique({
      where: { id: created.id },
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
        },
        dispatches: true,
      },
    });

    const amounts = await calculatePackageAmounts(createdWithLines.lines);

    const updated = await tx.quotePackage.update({
      where: { id: created.id },
      data: {
        totalAmount: amounts.totalAmount,
        estimatedSaving: amounts.estimatedSaving,
      },
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
        },
        dispatches: true,
      },
    });

    await recordAuditLog({
      tx,
      workspaceId,
      actorUserId: actorUser.id,
      entityType: "quote_package",
      entityId: created.id,
      action: "quote_package.created",
      details: {
        title: updated.title,
        sourceAlertId: updated.sourceAlertId,
        sourceSkuId: updated.sourceSkuId,
      },
    });

    return mapPackage(tx, updated);
  });
}

export async function getQuotePackageDetail(workspaceId, packageId) {
  const quotePackage = await prisma.quotePackage.findFirst({
    where: {
      workspaceId,
      id: packageId,
    },
    include: {
      lines: {
        include: {
          sku: true,
          preferredSupplier: true,
        },
      },
      approvals: {
        include: {
          assignedUser: true,
        },
        orderBy: { stepOrder: "asc" },
      },
      dispatches: {
        orderBy: { recordedAt: "desc" },
      },
    },
  });

  if (!quotePackage) {
    throw notFound("Quote package not found.");
  }

  return mapPackage(prisma, quotePackage);
}

export async function updateQuotePackage(workspaceId, packageId, actorUser, payload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotePackage.findFirst({
      where: {
        workspaceId,
        id: packageId,
      },
      include: {
        lines: true,
      },
    });

    if (!existing) {
      throw notFound("Quote package not found.");
    }

    if (existing.status !== "DRAFT") {
      throw forbidden("Only draft quote packages can be edited.");
    }

    await tx.quotePackage.update({
      where: { id: packageId },
      data: {
        ...(payload.title != null ? { title: payload.title } : {}),
        ...(payload.message != null ? { message: payload.message } : {}),
        ...(payload.scheduleAt !== undefined
          ? { scheduleAt: payload.scheduleAt ? new Date(payload.scheduleAt) : null }
          : {}),
        ...(payload.recipientSupplierIds
          ? { recipientSupplierIds: normalizeRecipientIds(payload.recipientSupplierIds) }
          : {}),
      },
    });

    if (Array.isArray(payload.lines)) {
      await tx.quotePackageLine.deleteMany({
        where: { quotePackageId: packageId },
      });

      for (const line of payload.lines) {
        await tx.quotePackageLine.create({
          data: {
            quotePackageId: packageId,
            skuId: line.skuId,
            alertId: line.alertId ?? null,
            preferredSupplierId: line.preferredSupplierId ?? null,
            quantity: toDecimal(line.quantity ?? 1),
            currentBestQuote: line.currentBestQuote != null ? toDecimal(line.currentBestQuote) : null,
            targetUnitPrice: line.targetUnitPrice != null ? toDecimal(line.targetUnitPrice) : null,
            estimatedSaving: line.estimatedSaving != null ? toDecimal(line.estimatedSaving) : ZERO_DECIMAL,
            note: line.note ?? null,
          },
        });
      }
    }

    const updated = await tx.quotePackage.findUnique({
      where: { id: packageId },
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
          orderBy: { stepOrder: "asc" },
        },
        dispatches: true,
      },
    });

    const amounts = await calculatePackageAmounts(updated.lines);

    const persisted = await tx.quotePackage.update({
      where: { id: packageId },
      data: {
        totalAmount: amounts.totalAmount,
        estimatedSaving: amounts.estimatedSaving,
      },
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
          orderBy: { stepOrder: "asc" },
        },
        dispatches: true,
      },
    });

    await recordAuditLog({
      tx,
      workspaceId,
      actorUserId: actorUser.id,
      entityType: "quote_package",
      entityId: packageId,
      action: "quote_package.updated",
      details: payload,
    });

    return mapPackage(tx, persisted);
  });
}

export async function submitQuotePackage(workspaceId, packageId, actorUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotePackage.findFirst({
      where: {
        workspaceId,
        id: packageId,
      },
      include: {
        lines: {
          include: {
            sku: true,
          },
        },
      },
    });

    if (!existing) {
      throw notFound("Quote package not found.");
    }

    if (existing.status !== "DRAFT") {
      throw badRequest("Only draft quote packages can be submitted.");
    }

    if (!existing.lines.length) {
      throw badRequest("Cannot submit an empty quote package.");
    }

    await tx.quotePackageApproval.deleteMany({
      where: {
        quotePackageId: packageId,
      },
    });

    await buildApprovalSteps(
      tx,
      workspaceId,
      packageId,
      existing.totalAmount,
      Array.from(new Set(existing.lines.map((line) => line.sku.category)))
    );

    const updated = await tx.quotePackage.update({
      where: { id: packageId },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
      },
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
          orderBy: { stepOrder: "asc" },
        },
        dispatches: true,
      },
    });

    await recordAuditLog({
      tx,
      workspaceId,
      actorUserId: actorUser.id,
      entityType: "quote_package",
      entityId: packageId,
      action: "quote_package.submitted",
      details: {
        approvalSteps: updated.approvals.length,
      },
    });

    return mapPackage(tx, updated);
  });
}

export async function decideQuotePackageApproval(workspaceId, packageId, stepId, actorUser, payload) {
  return prisma.$transaction(async (tx) => {
    const quotePackage = await tx.quotePackage.findFirst({
      where: {
        workspaceId,
        id: packageId,
      },
      include: {
        approvals: {
          orderBy: { stepOrder: "asc" },
          include: {
            assignedUser: true,
          },
        },
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        dispatches: true,
      },
    });

    if (!quotePackage) {
      throw notFound("Quote package not found.");
    }

    if (quotePackage.status !== "PENDING_APPROVAL") {
      throw badRequest("Quote package is not awaiting approval.");
    }

    const step = quotePackage.approvals.find((approval) => approval.id === stepId);
    if (!step) {
      throw notFound("Approval step not found.");
    }

    const currentPending = quotePackage.approvals.find((approval) => approval.status === "PENDING");
    if (!currentPending || currentPending.id !== step.id) {
      throw badRequest("Only the current approval step can be decided.");
    }

    if (actorUser.role !== "ADMIN" && actorUser.role !== step.roleRequired) {
      throw forbidden("Your role cannot decide this approval step.");
    }

    const decision = String(payload.decision ?? "").toLowerCase();
    if (!["approved", "rejected"].includes(decision)) {
      throw badRequest("Decision must be approved or rejected.");
    }

    await tx.quotePackageApproval.update({
      where: { id: step.id },
      data: {
        status: decision === "approved" ? "APPROVED" : "REJECTED",
        comment: payload.comment ?? null,
        decidedAt: new Date(),
        assignedUserId: actorUser.id,
      },
    });

    const remainingPendingCount = await tx.quotePackageApproval.count({
      where: {
        quotePackageId: packageId,
        status: "PENDING",
      },
    });

    const updated = await tx.quotePackage.update({
      where: { id: packageId },
      data:
        decision === "rejected"
          ? {
              status: "REJECTED",
              rejectedAt: new Date(),
            }
          : remainingPendingCount === 0
            ? {
                status: "APPROVED",
                approvedAt: new Date(),
              }
            : {},
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
          orderBy: { stepOrder: "asc" },
        },
        dispatches: true,
      },
    });

    await recordAuditLog({
      tx,
      workspaceId,
      actorUserId: actorUser.id,
      entityType: "quote_package",
      entityId: packageId,
      action: `quote_package.approval.${decision}`,
      details: {
        stepId,
        comment: payload.comment ?? null,
      },
    });

    return mapPackage(tx, updated);
  });
}

export async function dispatchQuotePackage(workspaceId, packageId, actorUser, payload) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quotePackage.findFirst({
      where: {
        workspaceId,
        id: packageId,
      },
      include: {
        lines: true,
        approvals: true,
        dispatches: true,
      },
    });

    if (!existing) {
      throw notFound("Quote package not found.");
    }

    if (existing.status !== "APPROVED") {
      throw badRequest("Only approved quote packages can be dispatched.");
    }

    const recipientSupplierIds = normalizeRecipientIds(
      payload.recipientSupplierIds ?? existing.recipientSupplierIds ?? []
    );
    if (!recipientSupplierIds.length) {
      throw badRequest("Dispatch requires at least one recipient supplier.");
    }

    const dispatch = await tx.quotePackageDispatch.create({
      data: {
        workspaceId,
        quotePackageId: packageId,
        dispatchedByUserId: actorUser.id,
        recipientSupplierIds,
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : existing.scheduleAt,
        notes: payload.notes ?? null,
      },
    });

    const quoteRequests = [];
    for (const supplierId of recipientSupplierIds) {
      quoteRequests.push(
        await tx.quoteRequest.create({
          data: {
            workspaceId,
            quotePackageId: packageId,
            supplierId,
            dispatchId: dispatch.id,
            requestedAt: new Date(),
            expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
          },
        })
      );
    }

    const updated = await tx.quotePackage.update({
      where: { id: packageId },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        recipientSupplierIds,
      },
      include: {
        lines: {
          include: {
            sku: true,
            preferredSupplier: true,
          },
        },
        approvals: {
          include: {
            assignedUser: true,
          },
          orderBy: { stepOrder: "asc" },
        },
        dispatches: {
          orderBy: { recordedAt: "desc" },
        },
      },
    });

    await recordAuditLog({
      tx,
      workspaceId,
      actorUserId: actorUser.id,
      entityType: "quote_package",
      entityId: packageId,
      action: "quote_package.dispatched",
      details: {
        dispatchId: dispatch.id,
        recipientSupplierIds,
      },
    });

    for (const request of quoteRequests) {
      await reconcileQuoteRequestAlert(workspaceId, request.id, tx);
    }

    return mapPackage(tx, updated);
  });
}
