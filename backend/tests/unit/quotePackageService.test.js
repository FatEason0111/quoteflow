import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import {
  createQuotePackage,
  decideQuotePackageApproval,
  dispatchQuotePackage,
  submitQuotePackage,
} from "../../src/services/quotePackageService.js";
import { seedTestData } from "../helpers/testData.js";

describe("quote package service", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("adds finance approval for high value metals packages", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow();
    const buyer = await prisma.user.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        role: "BUYER",
      },
    });
    const approver = await prisma.user.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        role: "APPROVER",
      },
    });
    const financeApprover = await prisma.user.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        role: "FINANCE_APPROVER",
      },
    });
    const nickel = await prisma.sku.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        code: "CN-NI-BAR",
      },
    });
    const marlin = await prisma.supplier.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        code: "SUP-MARLIN",
      },
    });

    const created = await createQuotePackage(workspace.id, buyer, {
      title: "High value nickel package",
      recipientSupplierIds: [marlin.id],
      lines: [
        {
          skuId: nickel.id,
          preferredSupplierId: marlin.id,
          quantity: 3,
          currentBestQuote: 126800,
          targetUnitPrice: 125000,
          estimatedSaving: 5400,
        },
      ],
    });

    const submitted = await submitQuotePackage(workspace.id, created.id, buyer);
    expect(submitted.approvals).toHaveLength(2);
    expect(submitted.approvals.map((approval) => approval.requiredRole)).toEqual([
      "approver",
      "finance_approver",
    ]);

    const firstApproval = await decideQuotePackageApproval(
      workspace.id,
      created.id,
      submitted.approvals[0].id,
      approver,
      {
        decision: "approved",
      }
    );
    expect(firstApproval.status).toBe("pending_approval");

    const secondApproval = await decideQuotePackageApproval(
      workspace.id,
      created.id,
      submitted.approvals[1].id,
      financeApprover,
      {
        decision: "approved",
      }
    );
    expect(secondApproval.status).toBe("approved");

    const dispatched = await dispatchQuotePackage(workspace.id, created.id, buyer, {
      recipientSupplierIds: [marlin.id],
      notes: "Recorded after both approval steps.",
    });
    expect(dispatched.status).toBe("dispatched");
  });
});
