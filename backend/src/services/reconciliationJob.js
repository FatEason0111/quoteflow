import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { reconcileWorkspaceAlerts } from "./alertEngineService.js";

let intervalHandle = null;

export function startReconciliationJob() {
  if (intervalHandle) {
    return intervalHandle;
  }

  const run = async () => {
    try {
      const workspaces = await prisma.workspace.findMany({
        select: {
          id: true,
        },
      });

      for (const workspace of workspaces) {
        await reconcileWorkspaceAlerts(workspace.id);
      }
    } catch (error) {
      console.error("[reconciliation-job] failed", error);
    }
  };

  intervalHandle = setInterval(run, env.reconciliationIntervalMinutes * 60 * 1000);
  intervalHandle.unref?.();
  run();
  return intervalHandle;
}
