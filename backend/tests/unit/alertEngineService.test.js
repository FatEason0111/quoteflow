import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import {
  reconcileQuoteRequestAlert,
  reconcileWorkspaceAlerts,
} from "../../src/services/alertEngineService.js";
import { seedTestData } from "../helpers/testData.js";

describe("alert engine service", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("resolves movement and spread alerts after thresholds are increased", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow();

    await prisma.workspaceSetting.update({
      where: {
        workspaceId: workspace.id,
      },
      data: {
        movementThresholdPercent: 50,
        quoteSpreadThresholdCny: 5000,
      },
    });

    await reconcileWorkspaceAlerts(workspace.id);

    const openAlerts = await prisma.alert.findMany({
      where: {
        workspaceId: workspace.id,
        status: "OPEN",
        type: {
          in: ["PRICE_MOVEMENT", "QUOTE_SPREAD"],
        },
      },
    });

    expect(openAlerts).toHaveLength(0);
  });

  it("resolves an SLA alert after the supplier responds", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow();
    const pendingRequest = await prisma.quoteRequest.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        status: "PENDING",
      },
    });

    await prisma.quoteRequest.update({
      where: {
        id: pendingRequest.id,
      },
      data: {
        status: "RESPONDED",
        respondedAt: new Date(),
      },
    });

    await reconcileQuoteRequestAlert(workspace.id, pendingRequest.id);

    const alert = await prisma.alert.findFirst({
      where: {
        workspaceId: workspace.id,
        quoteRequestId: pendingRequest.id,
      },
    });

    expect(alert.status).toBe("RESOLVED");
  });
});
