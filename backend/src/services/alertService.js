import { prisma } from "../lib/prisma.js";
import { buildMeta, parseListQuery } from "../utils/pagination.js";
import { currencyField, toApiAlertStatus, toAlertSeverity } from "../utils/presentation.js";
import { notFound } from "../utils/errors.js";

function mapAlert(alert) {
  return {
    id: alert.id,
    type: alert.type.toLowerCase(),
    status: toApiAlertStatus(alert.status),
    severity: toAlertSeverity(alert.severity),
    title: alert.title,
    summary: alert.summary,
    potentialSaving: currencyField(alert.potentialSaving),
    affectedItems: alert.affectedItems,
    windowLabel: alert.windowLabel,
    whyTitle: alert.whyTitle,
    whyCopy: alert.whyCopy,
    moveTitle: alert.moveTitle,
    moveCopy: alert.moveCopy,
    metricValue: alert.metricValue == null ? null : Number(alert.metricValue),
    thresholdValue: alert.thresholdValue == null ? null : Number(alert.thresholdValue),
    sku: alert.sku
      ? {
          id: alert.sku.id,
          code: alert.sku.code,
          name: alert.sku.name,
          category: alert.sku.category,
        }
      : null,
    supplier: alert.supplier
      ? {
          id: alert.supplier.id,
          code: alert.supplier.code,
          name: alert.supplier.name,
        }
      : null,
    quoteRequestId: alert.quoteRequestId,
    updatedAt: alert.updatedAt.toISOString(),
    createdAt: alert.createdAt.toISOString(),
  };
}

function sortAlerts(items, sortField, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const getter = {
    createdAt: (item) => item.createdAt,
    updatedAt: (item) => item.updatedAt,
    severity: (item) => item.severity,
    title: (item) => item.title,
    potentialSaving: (item) => item.potentialSaving.value ?? 0,
  }[sortField];

  if (!getter) {
    return items;
  }

  return [...items].sort((left, right) => {
    const leftValue = getter(left);
    const rightValue = getter(right);
    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return 0;
  });
}

export async function listAlerts(workspaceId, query = {}) {
  const listQuery = parseListQuery(query, ["createdAt", "updatedAt", "severity", "title", "potentialSaving"], "updatedAt:desc");
  const alerts = await prisma.alert.findMany({
    where: {
      workspaceId,
    },
    include: {
      sku: true,
      supplier: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  let mapped = alerts.map(mapAlert);

  if (query.status) {
    mapped = mapped.filter((alert) => alert.status === String(query.status).toLowerCase());
  }

  if (query.type) {
    mapped = mapped.filter((alert) => alert.type === String(query.type).toLowerCase());
  }

  if (listQuery.search) {
    const search = listQuery.search.toLowerCase();
    mapped = mapped.filter((alert) =>
      [alert.title, alert.summary, alert.sku?.code, alert.sku?.name, alert.supplier?.name]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search))
    );
  }

  const sorted = sortAlerts(mapped, listQuery.sortField, listQuery.sortDirection);
  const paged = sorted.slice(listQuery.skip, listQuery.skip + listQuery.take);

  return {
    items: paged,
    meta: buildMeta({
      total: sorted.length,
      page: listQuery.page,
      pageSize: listQuery.pageSize,
      sortField: listQuery.sortField,
      sortDirection: listQuery.sortDirection,
    }),
  };
}

export async function getAlertDetail(workspaceId, alertId) {
  const alert = await prisma.alert.findFirst({
    where: {
      workspaceId,
      id: alertId,
    },
    include: {
      sku: true,
      supplier: true,
      quoteRequest: {
        include: {
          quotePackage: true,
        },
      },
    },
  });

  if (!alert) {
    throw notFound("Alert not found.");
  }

  return {
    ...mapAlert(alert),
    quotePackage: alert.quoteRequest?.quotePackage
      ? {
          id: alert.quoteRequest.quotePackage.id,
          title: alert.quoteRequest.quotePackage.title,
          status: alert.quoteRequest.quotePackage.status.toLowerCase(),
        }
      : null,
  };
}
