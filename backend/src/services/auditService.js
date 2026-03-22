import { prisma } from "../lib/prisma.js";

export async function recordAuditLog({
  tx = prisma,
  workspaceId,
  actorUserId,
  entityType,
  entityId,
  action,
  details,
}) {
  return tx.auditLog.create({
    data: {
      workspaceId,
      actorUserId,
      entityType,
      entityId,
      action,
      details,
    },
  });
}
