import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/utils/auth.js";
import { recordAuditLog } from "../src/services/auditService.js";
import { reconcileWorkspaceAlerts } from "../src/services/alertEngineService.js";
import { toDecimal } from "../src/utils/decimal.js";

const daysAgo = (days, hour = 9) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

const hoursAgo = (hours) => {
  const date = new Date();
  date.setTime(date.getTime() - hours * 60 * 60 * 1000);
  return date;
};

export async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.quotePackageApproval.deleteMany();
  await prisma.quotePackageLine.deleteMany();
  await prisma.quoteRequest.deleteMany();
  await prisma.quotePackageDispatch.deleteMany();
  await prisma.quotePackage.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.supplierQuote.deleteMany();
  await prisma.pricePoint.deleteMany();
  await prisma.watchlistItem.deleteMany();
  await prisma.approvalRule.deleteMany();
  await prisma.workspaceSetting.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.sku.deleteMany();
  await prisma.workspace.deleteMany();
}

export async function seedDemoData() {
  await resetDatabase();

  const workspace = await prisma.workspace.create({
    data: {
      name: "Northstar Metals Procurement",
      slug: "northstar-cn",
      timezone: "Asia/Shanghai",
      currency: "CNY",
    },
  });

  const defaultPassword = "QuoteFlow123!";
  const passwordHash = await hashPassword(defaultPassword);

  await prisma.user.createMany({
    data: [
      {
        workspaceId: workspace.id,
        email: "admin@quoteflow.local",
        name: "Eason Chen",
        passwordHash,
        role: "ADMIN",
      },
      {
        workspaceId: workspace.id,
        email: "analyst@quoteflow.local",
        name: "Mia Analyst",
        passwordHash,
        role: "ANALYST",
      },
      {
        workspaceId: workspace.id,
        email: "buyer@quoteflow.local",
        name: "Kelly Buyer",
        passwordHash,
        role: "BUYER",
      },
      {
        workspaceId: workspace.id,
        email: "approver@quoteflow.local",
        name: "Victor Approver",
        passwordHash,
        role: "APPROVER",
      },
      {
        workspaceId: workspace.id,
        email: "finance@quoteflow.local",
        name: "Fiona Finance",
        passwordHash,
        role: "FINANCE_APPROVER",
      },
    ],
  });

  const users = await prisma.user.findMany({
    where: {
      workspaceId: workspace.id,
    },
  });

  const adminUser = users.find((user) => user.role === "ADMIN");
  const buyerUser = users.find((user) => user.role === "BUYER");
  const approverUser = users.find((user) => user.role === "APPROVER");

  await prisma.workspaceSetting.create({
    data: {
      workspaceId: workspace.id,
      movementThresholdPercent: toDecimal(5),
      quoteSpreadThresholdCny: toDecimal(300),
      responseSlaHours: 36,
      inboxDelivery: true,
      emailDigest: true,
      slackWecomCritical: false,
    },
  });

  await prisma.approvalRule.createMany({
    data: [
      {
        workspaceId: workspace.id,
        name: "Metals routing",
        category: "Metals",
        requiredRole: "APPROVER",
        stepOrder: 1,
      },
      {
        workspaceId: workspace.id,
        name: "High value finance review",
        minPackageAmount: toDecimal(300000),
        requiredRole: "FINANCE_APPROVER",
        stepOrder: 2,
      },
    ],
  });

  await prisma.sku.createMany({
    data: [
      {
        workspaceId: workspace.id,
        code: "CN-SS-304",
        name: "304 Sheet",
        category: "Metals",
        region: "East",
        unit: "ton",
      },
      {
        workspaceId: workspace.id,
        code: "CN-AL-1060",
        name: "Aluminum Coil",
        category: "Metals",
        region: "East",
        unit: "ton",
      },
      {
        workspaceId: workspace.id,
        code: "CN-NI-BAR",
        name: "Nickel Bar",
        category: "Metals",
        region: "East",
        unit: "ton",
      },
      {
        workspaceId: workspace.id,
        code: "CN-CU-8MM",
        name: "Copper Rod",
        category: "Metals",
        region: "East",
        unit: "ton",
      },
      {
        workspaceId: workspace.id,
        code: "CN-ZN-PLATE",
        name: "Zinc Plate",
        category: "Surface",
        region: "East",
        unit: "ton",
      },
    ],
  });

  const skuMap = Object.fromEntries(
    (
      await prisma.sku.findMany({
        where: { workspaceId: workspace.id },
      })
    ).map((sku) => [sku.code, sku])
  );

  await prisma.watchlistItem.createMany({
    data: [
      {
        workspaceId: workspace.id,
        skuId: skuMap["CN-SS-304"].id,
        priority: 5,
        status: "REVIEW",
      },
      {
        workspaceId: workspace.id,
        skuId: skuMap["CN-AL-1060"].id,
        priority: 5,
        status: "ESCALATE",
      },
      {
        workspaceId: workspace.id,
        skuId: skuMap["CN-NI-BAR"].id,
        priority: 4,
        status: "REVIEW",
      },
      {
        workspaceId: workspace.id,
        skuId: skuMap["CN-CU-8MM"].id,
        priority: 3,
        status: "GOOD",
      },
      {
        workspaceId: workspace.id,
        skuId: skuMap["CN-ZN-PLATE"].id,
        priority: 2,
        status: "TRACK",
      },
    ],
  });

  await prisma.supplier.createMany({
    data: [
      {
        workspaceId: workspace.id,
        code: "SUP-SHINWELL",
        name: "Shinwell",
        region: "East",
        categories: ["Metals"],
        tier: "Preferred",
        score: 92,
        quoteAccuracyPct: toDecimal(97),
      },
      {
        workspaceId: workspace.id,
        code: "SUP-NORTH-HARBOR",
        name: "North Harbor",
        region: "East",
        categories: ["Metals", "Surface"],
        tier: "Core",
        score: 87,
        quoteAccuracyPct: toDecimal(95),
      },
      {
        workspaceId: workspace.id,
        code: "SUP-JADE",
        name: "Jade Source",
        region: "East",
        categories: ["Metals", "Surface"],
        tier: "Backup",
        score: 74,
        quoteAccuracyPct: toDecimal(90),
      },
      {
        workspaceId: workspace.id,
        code: "SUP-MARLIN",
        name: "Marlin Steel",
        region: "North",
        categories: ["Metals"],
        tier: "Core",
        score: 88,
        quoteAccuracyPct: toDecimal(96),
      },
      {
        workspaceId: workspace.id,
        code: "SUP-ATLAS",
        name: "Atlas Trade",
        region: "East",
        categories: ["Metals"],
        tier: "Backup",
        score: 80,
        quoteAccuracyPct: toDecimal(93),
      },
    ],
  });

  const supplierMap = Object.fromEntries(
    (
      await prisma.supplier.findMany({
        where: {
          workspaceId: workspace.id,
        },
      })
    ).map((supplier) => [supplier.code, supplier])
  );

  const pricePointData = [
    ["CN-SS-304", [4580, 4620, 4700, 4780, 4810, 4860]],
    ["CN-AL-1060", [17350, 17520, 17880, 18120, 18310, 18420]],
    ["CN-NI-BAR", [121500, 122000, 123600, 124800, 125900, 126800]],
    ["CN-CU-8MM", [62200, 62000, 61850, 61720, 61550, 61300]],
    ["CN-ZN-PLATE", [22320, 22410, 22520, 22640, 22690, 22740]],
  ];

  for (const [skuCode, prices] of pricePointData) {
    for (const [index, price] of prices.entries()) {
      await prisma.pricePoint.create({
        data: {
          workspaceId: workspace.id,
          skuId: skuMap[skuCode].id,
          price: toDecimal(price),
          source: "seed",
          recordedAt: daysAgo(35 - index * 7),
        },
      });
    }
  }

  const supplierQuotes = [
    ["CN-SS-304", "SUP-SHINWELL", 4860, 7, 3],
    ["CN-SS-304", "SUP-NORTH-HARBOR", 5280, 6, 2],
    ["CN-SS-304", "SUP-JADE", 5400, 9, 1],
    ["CN-AL-1060", "SUP-NORTH-HARBOR", 18420, 6, 3],
    ["CN-AL-1060", "SUP-SHINWELL", 19330, 8, 2],
    ["CN-AL-1060", "SUP-ATLAS", 19900, 7, 1],
    ["CN-NI-BAR", "SUP-MARLIN", 126800, 10, 3],
    ["CN-NI-BAR", "SUP-NORTH-HARBOR", 128060, 9, 2],
    ["CN-NI-BAR", "SUP-ATLAS", 129000, 10, 1],
    ["CN-CU-8MM", "SUP-ATLAS", 61300, 5, 3],
    ["CN-CU-8MM", "SUP-SHINWELL", 61880, 6, 2],
    ["CN-ZN-PLATE", "SUP-JADE", 22740, 8, 3],
    ["CN-ZN-PLATE", "SUP-NORTH-HARBOR", 23000, 7, 2],
  ];

  for (const [skuCode, supplierCode, unitPrice, leadTimeDays, daysBack] of supplierQuotes) {
    await prisma.supplierQuote.create({
      data: {
        workspaceId: workspace.id,
        skuId: skuMap[skuCode].id,
        supplierId: supplierMap[supplierCode].id,
        unitPrice: toDecimal(unitPrice),
        leadTimeDays,
        quoteDate: daysAgo(daysBack),
        effectiveAt: daysAgo(daysBack),
        expiresAt: daysAgo(-14),
        isActive: true,
        notes: "Seeded quote",
      },
    });
  }

  const dispatchedPackage = await prisma.quotePackage.create({
    data: {
      workspaceId: workspace.id,
      createdByUserId: buyerUser.id,
      sourceSkuId: skuMap["CN-SS-304"].id,
      title: "304 Sheet fast-turn request",
      message: "Please confirm revised freight and lead time before today 14:00.",
      recipientSupplierIds: [
        supplierMap["SUP-SHINWELL"].id,
        supplierMap["SUP-NORTH-HARBOR"].id,
        supplierMap["SUP-JADE"].id,
      ],
      status: "DISPATCHED",
      currency: "CNY",
      totalAmount: toDecimal(48600),
      estimatedSaving: toDecimal(32000),
      submittedAt: hoursAgo(52),
      approvedAt: hoursAgo(50),
      dispatchedAt: hoursAgo(48),
    },
  });

  await prisma.quotePackageLine.create({
    data: {
      quotePackageId: dispatchedPackage.id,
      skuId: skuMap["CN-SS-304"].id,
      preferredSupplierId: supplierMap["SUP-SHINWELL"].id,
      quantity: toDecimal(10),
      currentBestQuote: toDecimal(4860),
      targetUnitPrice: toDecimal(4700),
      estimatedSaving: toDecimal(1600),
      note: "Urgent commercial refresh",
    },
  });

  await prisma.quotePackageApproval.create({
    data: {
      quotePackageId: dispatchedPackage.id,
      stepOrder: 1,
      roleRequired: "APPROVER",
      assignedUserId: approverUser.id,
      label: "Metals routing",
      status: "APPROVED",
      decidedAt: hoursAgo(50),
      comment: "Approved for same-day dispatch.",
    },
  });

  const dispatch = await prisma.quotePackageDispatch.create({
    data: {
      workspaceId: workspace.id,
      quotePackageId: dispatchedPackage.id,
      dispatchedByUserId: buyerUser.id,
      recipientSupplierIds: [
        supplierMap["SUP-SHINWELL"].id,
        supplierMap["SUP-NORTH-HARBOR"].id,
        supplierMap["SUP-JADE"].id,
      ],
      status: "RECORDED",
      recordedAt: hoursAgo(48),
      scheduledAt: hoursAgo(48),
      notes: "Recorded as sent to suppliers, no external channel triggered.",
    },
  });

  await prisma.quoteRequest.createMany({
    data: [
      {
        workspaceId: workspace.id,
        quotePackageId: dispatchedPackage.id,
        supplierId: supplierMap["SUP-SHINWELL"].id,
        dispatchId: dispatch.id,
        requestedAt: hoursAgo(48),
        respondedAt: hoursAgo(45.9),
        status: "RESPONDED",
        responseNotes: "Updated pricing returned quickly.",
      },
      {
        workspaceId: workspace.id,
        quotePackageId: dispatchedPackage.id,
        supplierId: supplierMap["SUP-NORTH-HARBOR"].id,
        dispatchId: dispatch.id,
        requestedAt: hoursAgo(48),
        respondedAt: hoursAgo(44.6),
        status: "RESPONDED",
        responseNotes: "Freight revision confirmed.",
      },
      {
        workspaceId: workspace.id,
        quotePackageId: dispatchedPackage.id,
        supplierId: supplierMap["SUP-JADE"].id,
        dispatchId: dispatch.id,
        requestedAt: hoursAgo(48),
        status: "PENDING",
      },
    ],
  });

  await reconcileWorkspaceAlerts(workspace.id);

  const alertMap = Object.fromEntries(
    (
      await prisma.alert.findMany({
        where: {
          workspaceId: workspace.id,
          status: "OPEN",
        },
      })
    ).map((alert) => [`${alert.type}:${alert.skuId ?? alert.quoteRequestId}`, alert])
  );

  const draftPackage = await prisma.quotePackage.create({
    data: {
      workspaceId: workspace.id,
      createdByUserId: buyerUser.id,
      sourceAlertId: alertMap[`QUOTE_SPREAD:${skuMap["CN-SS-304"].id}`]?.id ?? null,
      sourceSkuId: skuMap["CN-SS-304"].id,
      title: "East metals negotiation pack",
      message: "Need updated commercial terms before 14:00. Request revised freight and lead-time confirmation.",
      recipientSupplierIds: [
        supplierMap["SUP-SHINWELL"].id,
        supplierMap["SUP-NORTH-HARBOR"].id,
        supplierMap["SUP-MARLIN"].id,
        supplierMap["SUP-ATLAS"].id,
      ],
      status: "DRAFT",
      currency: "CNY",
      totalAmount: toDecimal(193820),
      estimatedSaving: toDecimal(58200),
      scheduleAt: daysAgo(0, 6),
    },
  });

  await prisma.quotePackageLine.createMany({
    data: [
      {
        quotePackageId: draftPackage.id,
        skuId: skuMap["CN-SS-304"].id,
        alertId: alertMap[`QUOTE_SPREAD:${skuMap["CN-SS-304"].id}`]?.id ?? null,
        preferredSupplierId: supplierMap["SUP-SHINWELL"].id,
        quantity: toDecimal(10),
        currentBestQuote: toDecimal(4860),
        targetUnitPrice: toDecimal(4700),
        estimatedSaving: toDecimal(16000),
      },
      {
        quotePackageId: draftPackage.id,
        skuId: skuMap["CN-AL-1060"].id,
        alertId: alertMap[`PRICE_MOVEMENT:${skuMap["CN-AL-1060"].id}`]?.id ?? null,
        preferredSupplierId: supplierMap["SUP-NORTH-HARBOR"].id,
        quantity: toDecimal(3),
        currentBestQuote: toDecimal(18420),
        targetUnitPrice: toDecimal(17900),
        estimatedSaving: toDecimal(15600),
      },
      {
        quotePackageId: draftPackage.id,
        skuId: skuMap["CN-NI-BAR"].id,
        alertId: alertMap[`QUOTE_SPREAD:${skuMap["CN-NI-BAR"].id}`]?.id ?? null,
        preferredSupplierId: supplierMap["SUP-MARLIN"].id,
        quantity: toDecimal(1),
        currentBestQuote: toDecimal(126800),
        targetUnitPrice: toDecimal(124200),
        estimatedSaving: toDecimal(26600),
      },
    ],
  });

  await recordAuditLog({
    workspaceId: workspace.id,
    actorUserId: adminUser.id,
    entityType: "seed",
    entityId: workspace.id,
    action: "seed.completed",
    details: {
      userEmails: users.map((user) => user.email),
      defaultPassword,
      draftPackageId: draftPackage.id,
      dispatchedPackageId: dispatchedPackage.id,
    },
  });

  return {
    workspace,
    users,
    defaultPassword,
    skuMap,
    supplierMap,
    packageIds: {
      draftPackageId: draftPackage.id,
      dispatchedPackageId: dispatchedPackage.id,
    },
  };
}
