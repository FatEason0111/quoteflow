import { prisma } from "../lib/prisma.js";
import { formatCurrency, formatHours, formatPercent } from "../utils/presentation.js";
import { decimalToNumber } from "../utils/decimal.js";
import { mapWatchlistItem } from "./watchlistService.js";

function latest(points) {
  return [...points].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0] ?? null;
}

function latestBefore(points, days) {
  return [...points]
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .find((point) => new Date(point.recordedAt) <= new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

export async function getOverview(workspaceId) {
  const [skus, alerts, suppliers, watchlistItems, quoteRequests] = await Promise.all([
    prisma.sku.findMany({
      where: { workspaceId },
      include: { pricePoints: true },
    }),
    prisma.alert.findMany({
      where: { workspaceId },
      include: {
        sku: true,
        supplier: true,
      },
    }),
    prisma.supplier.findMany({
      where: { workspaceId },
      include: {
        quoteRequests: true,
        supplierQuotes: true,
      },
    }),
    prisma.watchlistItem.findMany({
      where: { workspaceId },
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
    }),
    prisma.quoteRequest.findMany({
      where: { workspaceId },
      include: {
        supplier: true,
      },
      orderBy: { requestedAt: "desc" },
    }),
  ]);

  const mappedWatchlist = watchlistItems.map(mapWatchlistItem);
  const openAlerts = alerts.filter((alert) => alert.status === "OPEN");
  const potentialSaving = openAlerts.reduce((sum, alert) => sum + (decimalToNumber(alert.potentialSaving) ?? 0), 0);
  const responsiveRequests = quoteRequests.filter((request) => request.respondedAt);
  const avgResponseHours =
    responsiveRequests.length > 0
      ? responsiveRequests.reduce((sum, request) => {
          const hours =
            (new Date(request.respondedAt).getTime() - new Date(request.requestedAt).getTime()) /
            (1000 * 60 * 60);
          return sum + hours;
        }, 0) / responsiveRequests.length
      : null;

  const topMoverSku =
    skus
      .map((sku) => {
        const current = latest(sku.pricePoints);
        const baseline = latestBefore(sku.pricePoints, 7);
        const currentValue = decimalToNumber(current?.price);
        const baselineValue = decimalToNumber(baseline?.price);
        const movement =
          currentValue && baselineValue ? ((currentValue - baselineValue) / baselineValue) * 100 : 0;
        return { sku, movement };
      })
      .sort((left, right) => Math.abs(right.movement) - Math.abs(left.movement))[0] ?? null;

  const fastestSuppliers = suppliers
    .map((supplier) => {
      const responded = supplier.quoteRequests.filter((request) => request.respondedAt);
      const avgHours =
        responded.length > 0
          ? responded.reduce((sum, request) => {
              const hours =
                (new Date(request.respondedAt).getTime() - new Date(request.requestedAt).getTime()) /
                (1000 * 60 * 60);
              return sum + hours;
            }, 0) / responded.length
          : null;
      const wins = supplier.supplierQuotes.filter((quote) => quote.isActive).length;
      return {
        id: supplier.id,
        name: supplier.name,
        avgResponseHours: avgHours,
        winRatePercent: supplier.supplierQuotes.length
          ? Number(((wins / supplier.supplierQuotes.length) * 100).toFixed(0))
          : 0,
      };
    })
    .filter((supplier) => supplier.avgResponseHours != null)
    .sort((left, right) => left.avgResponseHours - right.avgResponseHours)
    .slice(0, 3)
    .map((supplier) => ({
      ...supplier,
      avgResponseLabel: formatHours(supplier.avgResponseHours),
    }));

  return {
    metrics: {
      trackedSkus: skus.length,
      activeAlerts: openAlerts.length,
      bestSavingWindow: {
        value: Number(potentialSaving.toFixed(2)),
        display: formatCurrency(potentialSaving),
        itemCount: openAlerts.filter((alert) => alert.potentialSaving != null).length,
      },
      supplierCoverage: {
        count: suppliers.length,
        responsiveRatePercent: quoteRequests.length
          ? Number(((responsiveRequests.length / quoteRequests.length) * 100).toFixed(0))
          : 0,
      },
    },
    marketPulse: topMoverSku
      ? {
          sku: topMoverSku.sku.name,
          movement7dPercent: Number(topMoverSku.movement.toFixed(1)),
          movementLabel: formatPercent(topMoverSku.movement),
          badge: topMoverSku.movement >= 0 ? "Stable uptrend" : "Needs review",
        }
      : null,
    signalStrip: {
      bestGap: formatCurrency(
        Math.max(...mappedWatchlist.map((item) => item.spread.value ?? 0), 0)
      ),
      riskVendors: openAlerts.filter((alert) => alert.type === "RESPONSE_SLA").length,
      nextWindow: "14:00",
    },
    actionQueue: openAlerts.slice(0, 4).map((alert, index) => ({
      slot: ["09:30", "11:00", "14:00", "17:30"][index] ?? null,
      label: alert.summary,
    })),
    topMovers: mappedWatchlist
      .sort((left, right) => Math.abs(right.trend7d.value ?? 0) - Math.abs(left.trend7d.value ?? 0))
      .slice(0, 3),
    supplierFocus: fastestSuppliers,
    suggestedMoves: [
      { step: "Open alert", copy: "Rank by savings and risk." },
      { step: "Compare", copy: "Check supplier spread and timing." },
      { step: "Send", copy: "Package the final quote plan." },
    ],
    averageResponseHours: avgResponseHours == null ? null : Number(avgResponseHours.toFixed(1)),
  };
}
