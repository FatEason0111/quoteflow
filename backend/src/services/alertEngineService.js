import { prisma } from "../lib/prisma.js";
import { decimalToNumber, toDecimal } from "../utils/decimal.js";

function resolveSeverity(ratio) {
  if (ratio >= 2) {
    return "CRITICAL";
  }

  if (ratio >= 1.4) {
    return "HIGH";
  }

  if (ratio >= 1.1) {
    return "MEDIUM";
  }

  return "LOW";
}

async function upsertSkuAlert({
  tx,
  workspaceId,
  skuId,
  type,
  shouldOpen,
  data,
}) {
  const existing = await tx.alert.findFirst({
    where: {
      workspaceId,
      skuId,
      type,
      dismissedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (!shouldOpen) {
    if (existing?.status === "OPEN") {
      await tx.alert.update({
        where: { id: existing.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
    }
    return;
  }

  if (existing) {
    await tx.alert.update({
      where: { id: existing.id },
      data: {
        ...data,
        status: "OPEN",
        resolvedAt: null,
      },
    });
    return;
  }

  await tx.alert.create({
    data: {
      workspaceId,
      skuId,
      type,
      status: "OPEN",
      ...data,
    },
  });
}

async function upsertQuoteRequestAlert({
  tx,
  workspaceId,
  quoteRequestId,
  supplierId,
  data,
  shouldOpen,
}) {
  const existing = await tx.alert.findFirst({
    where: {
      workspaceId,
      quoteRequestId,
      type: "RESPONSE_SLA",
      dismissedAt: null,
    },
  });

  if (!shouldOpen) {
    if (existing?.status === "OPEN") {
      await tx.alert.update({
        where: { id: existing.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
    }
    return;
  }

  if (existing) {
    await tx.alert.update({
      where: { id: existing.id },
      data: {
        ...data,
        supplierId,
        status: "OPEN",
        resolvedAt: null,
      },
    });
    return;
  }

  await tx.alert.create({
    data: {
      workspaceId,
      quoteRequestId,
      supplierId,
      type: "RESPONSE_SLA",
      status: "OPEN",
      ...data,
    },
  });
}

export async function reconcileSkuAlerts(workspaceId, skuId, tx = prisma) {
  const [settings, sku] = await Promise.all([
    tx.workspaceSetting.findUnique({
      where: {
        workspaceId,
      },
    }),
    tx.sku.findFirst({
      where: {
        workspaceId,
        id: skuId,
      },
      include: {
        pricePoints: true,
        supplierQuotes: {
          include: {
            supplier: true,
          },
        },
      },
    }),
  ]);

  if (!settings || !sku) {
    return;
  }

  const latestPoint = [...sku.pricePoints].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0];
  const thirtyDayBaseline = [...sku.pricePoints]
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .find((point) => new Date(point.recordedAt) <= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const movementThreshold = decimalToNumber(settings.movementThresholdPercent);
  const latestPrice = decimalToNumber(latestPoint?.price);
  const baselinePrice = decimalToNumber(thirtyDayBaseline?.price);
  const movementPercent =
    latestPrice && baselinePrice ? Math.abs(((latestPrice - baselinePrice) / baselinePrice) * 100) : null;

  await upsertSkuAlert({
    tx,
    workspaceId,
    skuId,
    type: "PRICE_MOVEMENT",
    shouldOpen: Boolean(movementPercent && movementPercent >= movementThreshold),
    data: {
      severity: resolveSeverity((movementPercent ?? 0) / movementThreshold),
      title: `${sku.name} crossed 30D band`,
      summary: `Price moved ${movementPercent?.toFixed(1) ?? "0.0"}% versus 30 days ago.`,
      potentialSaving: toDecimal(Math.abs((latestPrice ?? 0) - (baselinePrice ?? 0))),
      affectedItems: 1,
      windowLabel: movementPercent && movementPercent >= movementThreshold * 1.5 ? "Next 4h" : "Today",
      whyTitle: "The 30-day movement has broken through the action threshold.",
      whyCopy: "Use the updated baseline before the next pricing decision.",
      moveTitle: `Review ${sku.name} with the procurement lead.`,
      moveCopy: "Refresh the shortlist and confirm whether the active package should be re-priced.",
      metricValue: toDecimal(movementPercent ?? 0),
      thresholdValue: settings.movementThresholdPercent,
      payload: {
        latestPrice,
        baselinePrice,
        movementPercent,
      },
    },
  });

  const activeQuotes = sku.supplierQuotes
    .filter((quote) => quote.isActive && (!quote.expiresAt || new Date(quote.expiresAt) >= new Date()))
    .sort((left, right) => decimalToNumber(left.unitPrice) - decimalToNumber(right.unitPrice));
  const bestQuote = activeQuotes[0];
  const secondQuote = activeQuotes[1];
  const spreadThreshold = decimalToNumber(settings.quoteSpreadThresholdCny);
  const spread = bestQuote && secondQuote ? decimalToNumber(secondQuote.unitPrice) - decimalToNumber(bestQuote.unitPrice) : null;

  await upsertSkuAlert({
    tx,
    workspaceId,
    skuId,
    type: "QUOTE_SPREAD",
    shouldOpen: Boolean(spread && spread >= spreadThreshold),
    data: {
      severity: resolveSeverity((spread ?? 0) / spreadThreshold),
      title: `${sku.name} spread widened`,
      summary: `Gap widened to ¥${(spread ?? 0).toFixed(0)} between top two quotes.`,
      potentialSaving: toDecimal(spread ?? 0),
      affectedItems: activeQuotes.length,
      windowLabel: "Today",
      whyTitle: "Current best quote is stable but the challenger moved close enough to negotiate.",
      whyCopy: "The pricing gap is now large enough to justify an immediate follow-up.",
      moveTitle: `Shortlist ${bestQuote?.supplier.name ?? "the best supplier"} and ${secondQuote?.supplier.name ?? "the runner-up"}.`,
      moveCopy: "Move the item into the next quote package while the spread is still actionable.",
      metricValue: toDecimal(spread ?? 0),
      thresholdValue: settings.quoteSpreadThresholdCny,
      payload: {
        supplierIds: [bestQuote?.supplierId, secondQuote?.supplierId].filter(Boolean),
        spread,
      },
    },
  });
}

export async function reconcileQuoteRequestAlert(workspaceId, quoteRequestId, tx = prisma) {
  const [settings, quoteRequest] = await Promise.all([
    tx.workspaceSetting.findUnique({
      where: {
        workspaceId,
      },
    }),
    tx.quoteRequest.findFirst({
      where: {
        workspaceId,
        id: quoteRequestId,
      },
      include: {
        supplier: true,
        quotePackage: true,
      },
    }),
  ]);

  if (!settings || !quoteRequest) {
    return;
  }

  const endTime = quoteRequest.respondedAt ?? new Date();
  const overdueHours = (endTime.getTime() - quoteRequest.requestedAt.getTime()) / (1000 * 60 * 60);
  const shouldOpen =
    !quoteRequest.respondedAt && overdueHours >= settings.responseSlaHours && quoteRequest.status === "PENDING";

  await upsertQuoteRequestAlert({
    tx,
    workspaceId,
    quoteRequestId,
    supplierId: quoteRequest.supplierId,
    shouldOpen,
    data: {
      severity: resolveSeverity(overdueHours / settings.responseSlaHours),
      title: `${quoteRequest.supplier.name} delayed response`,
      summary: `Response SLA exceeded by ${(overdueHours - settings.responseSlaHours).toFixed(1)} hours.`,
      potentialSaving: null,
      affectedItems: 1,
      windowLabel: "Today",
      whyTitle: "Supplier responsiveness is slipping on an active request.",
      whyCopy: "If left unaddressed, the quote round may miss the current dispatch window.",
      moveTitle: "Swap in a fallback supplier or request a same-day confirmation.",
      moveCopy: `Keep ${quoteRequest.supplier.name} visible, but do not block the package on their reply.`,
      metricValue: toDecimal(overdueHours),
      thresholdValue: toDecimal(settings.responseSlaHours),
      payload: {
        overdueHours,
        packageId: quoteRequest.quotePackageId,
      },
    },
  });
}

export async function reconcileWorkspaceAlerts(workspaceId, tx = prisma) {
  const [skuIds, quoteRequestIds] = await Promise.all([
    tx.sku.findMany({
      where: { workspaceId },
      select: { id: true },
    }),
    tx.quoteRequest.findMany({
      where: { workspaceId },
      select: { id: true },
    }),
  ]);

  for (const sku of skuIds) {
    await reconcileSkuAlerts(workspaceId, sku.id, tx);
  }

  for (const quoteRequest of quoteRequestIds) {
    await reconcileQuoteRequestAlert(workspaceId, quoteRequest.id, tx);
  }
}
