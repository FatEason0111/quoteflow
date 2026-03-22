import { prisma } from "../lib/prisma.js";
import { buildMeta, parseListQuery } from "../utils/pagination.js";
import { currencyField, percentField, toWatchlistLabel } from "../utils/presentation.js";
import { decimalToNumber } from "../utils/decimal.js";
import { notFound } from "../utils/errors.js";

function getPriceAtOrBefore(pricePoints, cutoff) {
  const sorted = [...pricePoints].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  return sorted.find((item) => new Date(item.recordedAt) <= cutoff) ?? null;
}

function getLatestPrice(pricePoints) {
  return [...pricePoints].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0] ?? null;
}

function computeMovementPercent(latest, baseline) {
  const latestValue = decimalToNumber(latest?.price);
  const baselineValue = decimalToNumber(baseline?.price);
  if (!latestValue || !baselineValue) {
    return null;
  }

  return ((latestValue - baselineValue) / baselineValue) * 100;
}

function getCurrentQuotes(quotes) {
  const now = new Date();
  return quotes
    .filter((quote) => quote.isActive && (!quote.expiresAt || new Date(quote.expiresAt) >= now))
    .sort((left, right) => decimalToNumber(left.unitPrice) - decimalToNumber(right.unitPrice));
}

export function mapWatchlistItem(item) {
  const latestPrice = getLatestPrice(item.sku.pricePoints);
  const sevenDayBaseline = getPriceAtOrBefore(item.sku.pricePoints, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const thirtyDayBaseline = getPriceAtOrBefore(
    item.sku.pricePoints,
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const currentQuotes = getCurrentQuotes(item.sku.supplierQuotes);
  const bestQuote = currentQuotes[0] ?? null;
  const secondQuote = currentQuotes[1] ?? null;
  const spread = bestQuote && secondQuote ? decimalToNumber(secondQuote.unitPrice) - decimalToNumber(bestQuote.unitPrice) : null;
  const openAlerts = item.sku.alerts.filter((alert) => alert.status === "OPEN");

  return {
    id: item.id,
    sku: {
      id: item.sku.id,
      code: item.sku.code,
      name: item.sku.name,
      category: item.sku.category,
      region: item.sku.region,
    },
    bestQuote: currencyField(bestQuote?.unitPrice),
    spread: currencyField(spread),
    trend7d: percentField(computeMovementPercent(latestPrice, sevenDayBaseline)),
    movement30d: percentField(computeMovementPercent(latestPrice, thirtyDayBaseline)),
    latestPrice: currencyField(latestPrice?.price),
    supplier: bestQuote
      ? {
          id: bestQuote.supplier.id,
          name: bestQuote.supplier.name,
          code: bestQuote.supplier.code,
        }
      : null,
    status: {
      value: item.status.toLowerCase(),
      label: toWatchlistLabel(item.status),
    },
    openAlertCount: openAlerts.length,
    openAlertSeverity: openAlerts[0]?.severity.toLowerCase() ?? null,
    priority: item.priority,
  };
}

function applySearch(items, search) {
  if (!search) {
    return items;
  }

  const normalized = search.toLowerCase();
  return items.filter((item) =>
    [
      item.sku.code,
      item.sku.name,
      item.sku.category,
      item.sku.region,
      item.supplier?.name,
      item.status.label,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized))
  );
}

function applySort(items, sortField, sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const getter = {
    code: (item) => item.sku.code,
    name: (item) => item.sku.name,
    category: (item) => item.sku.category,
    bestQuote: (item) => item.bestQuote.value ?? Number.POSITIVE_INFINITY,
    spread: (item) => item.spread.value ?? Number.NEGATIVE_INFINITY,
    trend: (item) => item.trend7d.value ?? Number.NEGATIVE_INFINITY,
    supplier: (item) => item.supplier?.name ?? "",
    status: (item) => item.status.label,
    priority: (item) => item.priority,
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

export async function listWatchlist(workspaceId, query = {}) {
  const listQuery = parseListQuery(query, ["code", "name", "category", "bestQuote", "spread", "trend", "supplier", "status", "priority"], "priority:desc");
  const items = await prisma.watchlistItem.findMany({
    where: {
      workspaceId,
    },
    include: {
      sku: {
        include: {
          pricePoints: true,
          supplierQuotes: {
            include: {
              supplier: true,
            },
          },
          alerts: true,
        },
      },
    },
  });

  const mapped = items.map(mapWatchlistItem);
  const filtered = applySearch(mapped, listQuery.search);
  const sorted = applySort(filtered, listQuery.sortField, listQuery.sortDirection);
  const paged = sorted.slice(listQuery.skip, listQuery.skip + listQuery.take);

  const potentialSaving = filtered.reduce((sum, item) => sum + (item.spread.value ?? 0), 0);
  const summary = {
    openLines: filtered.length,
    openCritical: filtered.filter((item) => item.openAlertSeverity === "critical").length,
    averageSpreadPercent:
      filtered.length > 0
        ? Number(
            (
              filtered.reduce((sum, item) => sum + Math.abs(item.trend7d.value ?? 0), 0) / filtered.length
            ).toFixed(1)
          )
        : 0,
    suppliersInView: new Set(filtered.map((item) => item.supplier?.id).filter(Boolean)).size,
    potentialSaving: {
      value: Number(potentialSaving.toFixed(2)),
      display: potentialSaving ? currencyField(potentialSaving).display : null,
    },
  };

  return {
    items: paged,
    summary,
    meta: buildMeta({
      total: filtered.length,
      page: listQuery.page,
      pageSize: listQuery.pageSize,
      sortField: listQuery.sortField,
      sortDirection: listQuery.sortDirection,
    }),
  };
}

export async function getSkuSummary(workspaceId, skuId) {
  const sku = await prisma.sku.findFirst({
    where: {
      id: skuId,
      workspaceId,
    },
    include: {
      pricePoints: true,
      supplierQuotes: {
        include: {
          supplier: true,
        },
      },
      alerts: true,
      watchlistItems: true,
    },
  });

  if (!sku) {
    throw notFound("SKU not found.");
  }

  return sku;
}
