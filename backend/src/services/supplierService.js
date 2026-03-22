import { prisma } from "../lib/prisma.js";
import { buildMeta, parseListQuery } from "../utils/pagination.js";
import { currencyField, formatHours } from "../utils/presentation.js";
import { decimalToNumber } from "../utils/decimal.js";
import { notFound } from "../utils/errors.js";

function computeAverageResponseHours(quoteRequests) {
  const responded = quoteRequests.filter((request) => request.respondedAt);
  if (!responded.length) {
    return null;
  }

  return (
    responded.reduce((sum, request) => {
      const hours =
        (new Date(request.respondedAt).getTime() - new Date(request.requestedAt).getTime()) /
        (1000 * 60 * 60);
      return sum + hours;
    }, 0) / responded.length
  );
}

function mapSupplierSummary(supplier) {
  const avgResponseHours = computeAverageResponseHours(supplier.quoteRequests);
  const activeQuotes = supplier.supplierQuotes.filter((quote) => quote.isActive);
  const winRatePercent = supplier.supplierQuotes.length
    ? Number(((activeQuotes.length / supplier.supplierQuotes.length) * 100).toFixed(0))
    : 0;

  return {
    id: supplier.id,
    code: supplier.code,
    name: supplier.name,
    region: supplier.region,
    categories: supplier.categories,
    score: supplier.score,
    avgResponseHours: avgResponseHours == null ? null : Number(avgResponseHours.toFixed(1)),
    avgResponseLabel: avgResponseHours == null ? null : formatHours(avgResponseHours),
    winRatePercent,
    quoteAccuracyPercent: supplier.quoteAccuracyPct == null ? null : Number(supplier.quoteAccuracyPct),
    coverageCount: supplier.categories.length,
    tier: supplier.tier,
  };
}

function applySearch(items, search) {
  if (!search) {
    return items;
  }

  const normalized = search.toLowerCase();
  return items.filter((item) =>
    [item.code, item.name, item.region, ...(item.categories ?? [])]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized))
  );
}

export async function listSuppliers(workspaceId, query = {}) {
  const listQuery = parseListQuery(query, ["name", "score", "avgResponseHours", "winRatePercent"], "score:desc");
  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId },
    include: {
      quoteRequests: true,
      supplierQuotes: true,
    },
  });

  let mapped = suppliers.map(mapSupplierSummary);

  mapped = applySearch(mapped, listQuery.search);
  mapped.sort((left, right) => {
    const direction = listQuery.sortDirection === "asc" ? 1 : -1;
    const leftValue = left[listQuery.sortField] ?? 0;
    const rightValue = right[listQuery.sortField] ?? 0;
    if (leftValue < rightValue) {
      return -1 * direction;
    }
    if (leftValue > rightValue) {
      return 1 * direction;
    }
    return 0;
  });

  return {
    items: mapped.slice(listQuery.skip, listQuery.skip + listQuery.take),
    meta: buildMeta({
      total: mapped.length,
      page: listQuery.page,
      pageSize: listQuery.pageSize,
      sortField: listQuery.sortField,
      sortDirection: listQuery.sortDirection,
    }),
  };
}

export async function getSupplierDetail(workspaceId, supplierId) {
  const supplier = await prisma.supplier.findFirst({
    where: {
      workspaceId,
      id: supplierId,
    },
    include: {
      quoteRequests: {
        orderBy: { requestedAt: "desc" },
      },
      supplierQuotes: {
        include: {
          sku: true,
        },
        orderBy: { quoteDate: "desc" },
      },
    },
  });

  if (!supplier) {
    throw notFound("Supplier not found.");
  }

  const summary = mapSupplierSummary(supplier);
  const recentQuotes = supplier.supplierQuotes.slice(0, 10).map((quote, index) => ({
    id: quote.id,
    sku: {
      id: quote.sku.id,
      code: quote.sku.code,
      name: quote.sku.name,
    },
    quote: currencyField(quote.unitPrice),
    leadTimeDays: quote.leadTimeDays,
    result: index === 0 ? "best" : index === 1 ? "near" : "active",
    quoteDate: quote.quoteDate.toISOString(),
  }));

  return {
    ...summary,
    communication: supplier.quoteRequests.slice(0, 5).map((request) => ({
      id: request.id,
      occurredAt: request.requestedAt.toISOString(),
      label: request.respondedAt
        ? `Responded in ${formatHours(
            (new Date(request.respondedAt).getTime() - new Date(request.requestedAt).getTime()) /
              (1000 * 60 * 60)
          )}.`
        : "Awaiting supplier response.",
    })),
    quoteHistory: recentQuotes,
    risk: {
      delivery: supplier.quoteRequests.some((request) => !request.respondedAt)
        ? "Open response risk on at least one quote request."
        : "Response performance is currently stable.",
      commercial:
        decimalToNumber(supplier.quoteAccuracyPct) != null && decimalToNumber(supplier.quoteAccuracyPct) < 95
          ? "Quote accuracy is below the preferred threshold."
          : "Margin behavior is stable within the monitored bands.",
    },
    useCases: ["Fast-turn quote rounds", "Backup on large volumes", "Anchor reference in negotiation"],
  };
}
