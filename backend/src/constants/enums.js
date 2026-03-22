export const userRoles = {
  admin: "ADMIN",
  analyst: "ANALYST",
  buyer: "BUYER",
  approver: "APPROVER",
  financeApprover: "FINANCE_APPROVER",
};

export const userStatuses = {
  active: "ACTIVE",
  disabled: "DISABLED",
};

export const alertStatuses = {
  open: "OPEN",
  resolved: "RESOLVED",
  dismissed: "DISMISSED",
};

export const alertTypes = {
  priceMovement: "PRICE_MOVEMENT",
  quoteSpread: "QUOTE_SPREAD",
  responseSla: "RESPONSE_SLA",
};

export const alertSeverities = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

export const quotePackageStatuses = {
  draft: "DRAFT",
  pendingApproval: "PENDING_APPROVAL",
  approved: "APPROVED",
  rejected: "REJECTED",
  dispatched: "DISPATCHED",
  cancelled: "CANCELLED",
};

export const approvalStatuses = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

export const dispatchStatuses = {
  recorded: "RECORDED",
  responded: "RESPONDED",
  expired: "EXPIRED",
};

export const quoteRequestStatuses = {
  pending: "PENDING",
  responded: "RESPONDED",
  expired: "EXPIRED",
};

export const importJobTypes = {
  skus: "SKUS",
  suppliers: "SUPPLIERS",
  pricePoints: "PRICE_POINTS",
  quotes: "QUOTES",
};

export const importJobStatuses = {
  pending: "PENDING",
  completed: "COMPLETED",
  partial: "PARTIAL",
  failed: "FAILED",
};

export const watchlistStatuses = {
  review: "REVIEW",
  escalate: "ESCALATE",
  good: "GOOD",
  track: "TRACK",
};

export const apiFriendlyStatuses = {
  alerts: {
    OPEN: "open",
    RESOLVED: "resolved",
    DISMISSED: "dismissed",
  },
  quotePackages: {
    DRAFT: "draft",
    PENDING_APPROVAL: "pending_approval",
    APPROVED: "approved",
    REJECTED: "rejected",
    DISPATCHED: "dispatched",
    CANCELLED: "cancelled",
  },
  dispatches: {
    RECORDED: "recorded",
    RESPONDED: "responded",
    EXPIRED: "expired",
  },
  users: {
    ACTIVE: "active",
    DISABLED: "disabled",
  },
};
