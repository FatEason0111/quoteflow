import { prisma } from "../lib/prisma.js";
import { recordAuditLog } from "./auditService.js";
import { reconcileWorkspaceAlerts } from "./alertEngineService.js";
import { badRequest } from "../utils/errors.js";
import { decimalToNumber, toDecimal } from "../utils/decimal.js";
import { userRoles } from "../constants/enums.js";

const approvalRoleSet = new Set([userRoles.approver, userRoles.financeApprover]);

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

function parseFiniteNumber(value, field, { min = 0, max, integer = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw badRequest(`${field} must be a valid number.`);
  }

  if (integer && !Number.isInteger(numeric)) {
    throw badRequest(`${field} must be a whole number.`);
  }

  if (numeric < min) {
    throw badRequest(`${field} must be greater than or equal to ${min}.`);
  }

  if (max != null && numeric > max) {
    throw badRequest(`${field} must be less than or equal to ${max}.`);
  }

  return numeric;
}

function parseBooleanField(value, field) {
  if (typeof value !== "boolean") {
    throw badRequest(`${field} must be a boolean.`);
  }

  return value;
}

function normalizeApprovalRules(rules) {
  if (!Array.isArray(rules)) {
    throw badRequest("approvalRules must be an array.");
  }

  const normalized = rules.map((rule, index) => {
    const name = String(rule?.name ?? "").trim();
    if (!name) {
      throw badRequest(`approvalRules[${index}].name is required.`);
    }

    const requiredRole = String(rule?.requiredRole ?? "").trim().toUpperCase();
    if (!approvalRoleSet.has(requiredRole)) {
      throw badRequest(
        `approvalRules[${index}].requiredRole must be approver or finance_approver.`
      );
    }

    const stepOrder = parseFiniteNumber(rule?.stepOrder, `approvalRules[${index}].stepOrder`, {
      min: 1,
      integer: true,
    });

    const minPackageAmount =
      rule?.minPackageAmount == null
        ? null
        : parseFiniteNumber(rule.minPackageAmount, `approvalRules[${index}].minPackageAmount`, {
            min: 0,
          });

    return {
      name,
      category: rule?.category ? String(rule.category).trim() : null,
      minPackageAmount,
      requiredRole,
      stepOrder,
      isActive: rule?.isActive == null ? true : parseBooleanField(rule.isActive, `approvalRules[${index}].isActive`),
    };
  });

  const stepOrders = normalized.map((rule) => rule.stepOrder);
  if (new Set(stepOrders).size !== stepOrders.length) {
    throw badRequest("approvalRules stepOrder values must be unique.");
  }

  return normalized;
}

function normalizeSettingsPayload(payload) {
  const normalized = {};

  if (payload.movementThresholdPercent != null) {
    normalized.movementThresholdPercent = parseFiniteNumber(
      payload.movementThresholdPercent,
      "movementThresholdPercent",
      { min: 0, max: 1000 }
    );
  }

  if (payload.quoteSpreadThresholdCny != null) {
    normalized.quoteSpreadThresholdCny = parseFiniteNumber(
      payload.quoteSpreadThresholdCny,
      "quoteSpreadThresholdCny",
      { min: 0 }
    );
  }

  if (payload.responseSlaHours != null) {
    normalized.responseSlaHours = parseFiniteNumber(payload.responseSlaHours, "responseSlaHours", {
      min: 1,
      max: 24 * 30,
      integer: true,
    });
  }

  if (payload.channels != null) {
    if (typeof payload.channels !== "object" || Array.isArray(payload.channels)) {
      throw badRequest("channels must be an object.");
    }

    normalized.channels = {};

    if (payload.channels.inboxDelivery != null) {
      normalized.channels.inboxDelivery = parseBooleanField(
        payload.channels.inboxDelivery,
        "channels.inboxDelivery"
      );
    }

    if (payload.channels.emailDigest != null) {
      normalized.channels.emailDigest = parseBooleanField(
        payload.channels.emailDigest,
        "channels.emailDigest"
      );
    }

    if (payload.channels.slackWecomCritical != null) {
      normalized.channels.slackWecomCritical = parseBooleanField(
        payload.channels.slackWecomCritical,
        "channels.slackWecomCritical"
      );
    }
  }

  if (payload.approvalRules != null) {
    normalized.approvalRules = normalizeApprovalRules(payload.approvalRules);
  }

  return normalized;
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

  const normalizedPayload = normalizeSettingsPayload(payload);

  await prisma.$transaction(async (tx) => {
    await tx.workspaceSetting.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        movementThresholdPercent:
          normalizedPayload.movementThresholdPercent != null
            ? toDecimal(normalizedPayload.movementThresholdPercent)
            : undefined,
        quoteSpreadThresholdCny:
          normalizedPayload.quoteSpreadThresholdCny != null
            ? toDecimal(normalizedPayload.quoteSpreadThresholdCny)
            : undefined,
        responseSlaHours: normalizedPayload.responseSlaHours,
        inboxDelivery: normalizedPayload.channels?.inboxDelivery,
        emailDigest: normalizedPayload.channels?.emailDigest,
        slackWecomCritical: normalizedPayload.channels?.slackWecomCritical,
      },
      update: {
        ...(normalizedPayload.movementThresholdPercent != null
          ? { movementThresholdPercent: toDecimal(normalizedPayload.movementThresholdPercent) }
          : {}),
        ...(normalizedPayload.quoteSpreadThresholdCny != null
          ? { quoteSpreadThresholdCny: toDecimal(normalizedPayload.quoteSpreadThresholdCny) }
          : {}),
        ...(normalizedPayload.responseSlaHours != null
          ? { responseSlaHours: normalizedPayload.responseSlaHours }
          : {}),
        ...(normalizedPayload.channels
          ? {
              ...(normalizedPayload.channels.inboxDelivery != null
                ? { inboxDelivery: normalizedPayload.channels.inboxDelivery }
                : {}),
              ...(normalizedPayload.channels.emailDigest != null
                ? { emailDigest: normalizedPayload.channels.emailDigest }
                : {}),
              ...(normalizedPayload.channels.slackWecomCritical != null
                ? { slackWecomCritical: normalizedPayload.channels.slackWecomCritical }
                : {}),
            }
          : {}),
      },
    });

    if (Array.isArray(normalizedPayload.approvalRules)) {
      await tx.approvalRule.deleteMany({
        where: {
          workspaceId,
        },
      });

      if (normalizedPayload.approvalRules.length > 0) {
        await tx.approvalRule.createMany({
          data: normalizedPayload.approvalRules.map((rule) => ({
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
      details: normalizedPayload,
    });
  });

  await reconcileWorkspaceAlerts(workspaceId);
  return getSettings(workspaceId);
}
