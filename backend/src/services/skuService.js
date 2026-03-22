import { prisma } from "../lib/prisma.js";
import { currencyField, percentField } from "../utils/presentation.js";
import { decimalToNumber } from "../utils/decimal.js";
import { notFound } from "../utils/errors.js";

function latest(points) {
  return [...points].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0] ?? null;
}

function latestBefore(points, cutoff) {
  return [...points]
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .find((point) => new Date(point.recordedAt) <= cutoff);
}

function movementPercent(current, previous) {
  const currentValue = decimalToNumber(current?.price);
  const previousValue = decimalToNumber(previous?.price);
  if (!currentValue || !previousValue) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

export async function getSkuDetail(workspaceId, skuId) {
  const sku = await prisma.sku.findFirst({
    where: {
      workspaceId,
      id: skuId,
    },
    include: {
      pricePoints: {
        orderBy: { recordedAt: "asc" },
      },
      supplierQuotes: {
        include: {
          supplier: true,
        },
        orderBy: { quoteDate: "desc" },
      },
      alerts: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!sku) {
    throw notFound("SKU not found.");
  }

  const currentPrice = latest(sku.pricePoints);
  const baseline30d = latestBefore(sku.pricePoints, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const currentQuotes = sku.supplierQuotes
    .filter((quote) => quote.isActive && (!quote.expiresAt || new Date(quote.expiresAt) >= new Date()))
    .sort((left, right) => decimalToNumber(left.unitPrice) - decimalToNumber(right.unitPrice));
  const bestQuote = currentQuotes[0] ?? null;
  const secondQuote = currentQuotes[1] ?? null;
  const openAlerts = sku.alerts.filter((alert) => alert.status === "OPEN");
  const overdueAlert = openAlerts.find((alert) => alert.type === "RESPONSE_SLA");
  const spread = bestQuote && secondQuote ? decimalToNumber(secondQuote.unitPrice) - decimalToNumber(bestQuote.unitPrice) : null;

  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    category: sku.category,
    region: sku.region,
    unit: sku.unit,
    currentPrice: currencyField(currentPrice?.price),
    movement30d: percentField(movementPercent(currentPrice, baseline30d)),
    trendHistory: sku.pricePoints.map((point) => ({
      id: point.id,
      recordedAt: point.recordedAt.toISOString(),
      price: currencyField(point.price),
    })),
    supplierSummary: {
      bestSupplier: bestQuote
        ? {
            id: bestQuote.supplier.id,
            name: bestQuote.supplier.name,
            code: bestQuote.supplier.code,
          }
        : null,
      quoteSpread: currencyField(spread),
      responseRiskCount: openAlerts.filter((alert) => alert.type === "RESPONSE_SLA").length,
    },
    recommendation: {
      primaryMove:
        openAlerts.find((alert) => alert.type === "QUOTE_SPREAD")?.moveTitle ??
        `Open negotiation with ${bestQuote?.supplier.name ?? "preferred suppliers"}`,
      reason:
        openAlerts[0]?.whyTitle ??
        "Spread and movement are within an actionable range for a guided quote round.",
      risk:
        overdueAlert?.title ??
        "No supplier is currently over the configured response SLA.",
      window:
        openAlerts[0]?.windowLabel ??
        "Today",
    },
    quotes: currentQuotes.map((quote, index) => ({
      id: quote.id,
      supplier: {
        id: quote.supplier.id,
        name: quote.supplier.name,
      },
      quote: currencyField(quote.unitPrice),
      leadTimeDays: quote.leadTimeDays,
      status:
        index === 0
          ? "best"
          : index === 1
            ? "near"
            : quote.expiresAt && new Date(quote.expiresAt) < new Date()
              ? "expired"
              : "active",
      quotedAt: quote.quoteDate.toISOString(),
    })),
    recentEvents: [
      ...sku.supplierQuotes.slice(0, 3).map((quote) => ({
        type: "quote",
        occurredAt: quote.quoteDate.toISOString(),
        label: `New quote from ${quote.supplier.name} at ${currencyField(quote.unitPrice).display}.`,
      })),
      ...openAlerts.slice(0, 3).map((alert) => ({
        type: "alert",
        occurredAt: alert.updatedAt.toISOString(),
        label: alert.summary,
      })),
    ]
      .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
      .slice(0, 6),
    followUpSteps: [
      "Lock target price range.",
      `Contact ${bestQuote?.supplier.name ?? "shortlisted suppliers"} with updated commercial terms.`,
      "Move the approved scenario into dispatch.",
    ],
  };
}
