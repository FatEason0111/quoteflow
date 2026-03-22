import { apiFriendlyStatuses } from "../constants/enums.js";
import { decimalToNumber, roundCurrency } from "./decimal.js";

const watchlistLabels = {
  REVIEW: "Review",
  ESCALATE: "Escalate",
  GOOD: "Good",
  TRACK: "Track",
};

const alertSeverityLabels = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

export function formatCurrency(value) {
  if (value == null) {
    return null;
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(roundCurrency(value));
}

export function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return null;
  }

  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}%`;
}

export function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return null;
  }

  return `${Number(value).toFixed(1)}h`;
}

export function toApiUser(user, workspace) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
    status: apiFriendlyStatuses.users[user.status],
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          currency: workspace.currency,
        }
      : undefined,
  };
}

export function toApiAlertStatus(status) {
  return apiFriendlyStatuses.alerts[status] ?? status.toLowerCase();
}

export function toApiQuotePackageStatus(status) {
  return apiFriendlyStatuses.quotePackages[status] ?? status.toLowerCase();
}

export function toApiDispatchStatus(status) {
  return apiFriendlyStatuses.dispatches[status] ?? status.toLowerCase();
}

export function toWatchlistLabel(status) {
  return watchlistLabels[status] ?? status;
}

export function toAlertSeverity(value) {
  return alertSeverityLabels[value] ?? value.toLowerCase();
}

export function currencyField(value) {
  return {
    value: decimalToNumber(value),
    display: formatCurrency(value),
  };
}

export function percentField(value) {
  return {
    value: value == null ? null : Number(value),
    display: formatPercent(value),
  };
}
