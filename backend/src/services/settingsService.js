import { prisma } from "../lib/prisma.js";
import { recordAuditLog } from "./auditService.js";
import { reconcileWorkspaceAlerts } from "./alertEngineService.js";
import { badRequest } from "../utils/errors.js";
import { decimalToNumber, toDecimal } from "../utils/decimal.js";

function mapRule(rule) {
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    minPackageAmount: decimalToNumber(rule.minPackageAmount),
    requiredRole: rule.requiredRole.toLowerCase(),
    stepOrder: rule.stepOrder,
    isActive: rule.isActive,
  };
}

export async function getSettings(workspaceId) {
  const [settings, rules] = await Promise.all([
    prisma.workspaceSetting.findUnique({
      where: { workspaceId },
    }),
    prisma.approvalRule.findMany({
      where: {
        workspaceId,
      },
      orderBy: { stepOrder: "asc" },
    }),
  ]);

  return {
    movementThresholdPercent: decimalToNumber(settings?.movementThresholdPercent),
    quoteSpreadThresholdCny: decimalToNumber(settings?.quoteSpreadThresholdCny),
    responseSlaHours: settings?.responseSlaHours ?? 36,
    channels: {
      inboxDelivery: settings?.inboxDelivery ?? true,
      emailDigest: settings?.emailDigest ?? true,
      slackWecomCritical: settings?.slackWecomCritical ?? false,
    },
    approvalRules: rules.map(mapRule),
  };
}

export async function updateSettings(workspaceId, actorUserId, payload) {
  const allowed = [
    "movementThresholdPercent",
    "quoteSpreadThresholdCny",
    "responseSlaHours",
    "channels",
    "approvalRules",
  ];

  const unsupportedKeys = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unsupportedKeys.length) {
    throw badRequest("Payload contains unsupported settings keys.", { unsupportedKeys });
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceSetting.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        movementThresholdPercent:
          payload.movementThresholdPercent != null ? toDecimal(payload.movementThresholdPercent) : undefined,
        quoteSpreadThresholdCny:
          payload.quoteSpreadThresholdCny != null ? toDecimal(payload.quoteSpreadThresholdCny) : undefined,
        responseSlaHours: payload.responseSlaHours,
        inboxDelivery: payload.channels?.inboxDelivery,
        emailDigest: payload.channels?.emailDigest,
        slackWecomCritical: payload.channels?.slackWecomCritical,
      },
      update: {
        ...(payload.movementThresholdPercent != null
          ? { movementThresholdPercent: toDecimal(payload.movementThresholdPercent) }
          : {}),
        ...(payload.quoteSpreadThresholdCny != null
          ? { quoteSpreadThresholdCny: toDecimal(payload.quoteSpreadThresholdCny) }
          : {}),
        ...(payload.responseSlaHours != null ? { responseSlaHours: payload.responseSlaHours } : {}),
        ...(payload.channels
          ? {
              inboxDelivery: payload.channels.inboxDelivery,
              emailDigest: payload.channels.emailDigest,
              slackWecomCritical: payload.channels.slackWecomCritical,
            }
          : {}),
      },
    });

    if (Array.isArray(payload.approvalRules)) {
      await tx.approvalRule.deleteMany({
        where: {
          workspaceId,
        },
      });

      if (payload.approvalRules.length > 0) {
        await tx.approvalRule.createMany({
          data: payload.approvalRules.map((rule) => ({
            workspaceId,
            name: rule.name,
            category: rule.category ?? null,
            minPackageAmount:
              rule.minPackageAmount != null ? toDecimal(rule.minPackageAmount) : null,
            requiredRole: String(rule.requiredRole ?? "").toUpperCase(),
            stepOrder: rule.stepOrder,
            isActive: rule.isActive ?? true,
          })),
        });
      }
    }

    await recordAuditLog({
      tx,
      workspaceId,
      actorUserId,
      entityType: "workspace_settings",
      entityId: workspaceId,
      action: "settings.updated",
      details: payload,
    });
  });

  await reconcileWorkspaceAlerts(workspaceId);
  return getSettings(workspaceId);
}
