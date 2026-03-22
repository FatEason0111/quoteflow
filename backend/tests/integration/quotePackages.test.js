import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { createTestAgent } from "../helpers/testApp.js";
import { loginAs, seedTestData } from "../helpers/testData.js";

describe("quote package API", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("creates, submits, approves, and dispatches a quote package", async () => {
    const buyerAgent = createTestAgent();
    const approverAgent = createTestAgent();

    await loginAs(buyerAgent, "buyer@quoteflow.local");
    await loginAs(approverAgent, "approver@quoteflow.local");

    const sku = await prisma.sku.findFirstOrThrow({
      where: {
        code: "CN-SS-304",
      },
    });
    const shinwell = await prisma.supplier.findFirstOrThrow({
      where: {
        code: "SUP-SHINWELL",
      },
    });
    const northHarbor = await prisma.supplier.findFirstOrThrow({
      where: {
        code: "SUP-NORTH-HARBOR",
      },
    });

    const createResponse = await buyerAgent.post("/api/quote-packages").send({
      fromSkuId: sku.id,
      message: "Please refresh the pricing window before 14:00.",
      recipientSupplierIds: [shinwell.id, northHarbor.id],
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.status).toBe("draft");

    const packageId = createResponse.body.data.id;

    const submitResponse = await buyerAgent.post(`/api/quote-packages/${packageId}/submit`).send();
    expect(submitResponse.status).toBe(200);
    expect(submitResponse.body.data.status).toBe("pending_approval");
    expect(submitResponse.body.data.approvals).toHaveLength(1);

    const stepId = submitResponse.body.data.approvals[0].id;
    const approveResponse = await approverAgent
      .post(`/api/quote-packages/${packageId}/approvals/${stepId}/decision`)
      .send({
        decision: "approved",
        comment: "Ready for dispatch.",
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.data.status).toBe("approved");

    const dispatchResponse = await buyerAgent.post(`/api/quote-packages/${packageId}/dispatch`).send({
      recipientSupplierIds: [shinwell.id, northHarbor.id],
      notes: "Recorded as sent to suppliers.",
    });

    expect(dispatchResponse.status).toBe(200);
    expect(dispatchResponse.body.data.status).toBe("dispatched");

    const requests = await prisma.quoteRequest.findMany({
      where: {
        quotePackageId: packageId,
      },
    });
    expect(requests).toHaveLength(2);
  });
});
