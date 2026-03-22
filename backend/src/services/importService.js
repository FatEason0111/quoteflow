import { prisma } from "../lib/prisma.js";
import { parseCsvBuffer } from "../utils/csv.js";
import { badRequest, notFound } from "../utils/errors.js";
import { importJobStatuses, importJobTypes } from "../constants/enums.js";
import { recordAuditLog } from "./auditService.js";
import { toDecimal } from "../utils/decimal.js";
import { reconcileSkuAlerts } from "./alertEngineService.js";

function mapImportJob(job) {
  return {
    id: job.id,
    type: job.type.toLowerCase(),
    status: job.status.toLowerCase(),
    sourceName: job.sourceName,
    totalRows: job.totalRows,
    successCount: job.successCount,
    failureCount: job.failureCount,
    rowErrors: job.rowErrors ?? [],
    startedAt: job.startedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

async function createJob(workspaceId, actorUserId, type, sourceName) {
  return prisma.importJob.create({
    data: {
      workspaceId,
      createdByUserId: actorUserId,
      type,
      status: importJobStatuses.pending,
      sourceName,
    },
  });
}

async function finalizeJob(jobId, data) {
  return prisma.importJob.update({
    where: { id: jobId },
    data: {
      ...data,
      completedAt: new Date(),
    },
  });
}

function normalizeCategories(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function processSkuRows(workspaceId, rows, jobId) {
  const affectedSkuIds = [];
  const rowErrors = [];
  let successCount = 0;

  for (const [index, row] of rows.entries()) {
    try {
      if (!row.code || !row.name || !row.category) {
        throw new Error("code, name, and category are required.");
      }

      const sku = await prisma.sku.upsert({
        where: {
          workspaceId_code: {
            workspaceId,
            code: row.code,
          },
        },
        create: {
          workspaceId,
          code: row.code,
          name: row.name,
          category: row.category,
          region: row.region || null,
          unit: row.unit || null,
          description: row.description || null,
        },
        update: {
          name: row.name,
          category: row.category,
          region: row.region || null,
          unit: row.unit || null,
          description: row.description || null,
        },
      });

      await prisma.watchlistItem.upsert({
        where: {
          workspaceId_skuId: {
            workspaceId,
            skuId: sku.id,
          },
        },
        create: {
          workspaceId,
          skuId: sku.id,
          priority: Number.parseInt(row.priority ?? "1", 10) || 1,
          status: String(row.watch_status ?? "REVIEW").toUpperCase(),
        },
        update: {
          priority: Number.parseInt(row.priority ?? "1", 10) || 1,
          status: String(row.watch_status ?? "REVIEW").toUpperCase(),
        },
      });

      affectedSkuIds.push(sku.id);
      successCount += 1;
    } catch (error) {
      rowErrors.push({
        rowNumber: index + 2,
        message: error.message,
        row,
      });
    }
  }

  return { rowErrors, successCount, affectedSkuIds };
}

async function processSupplierRows(workspaceId, rows) {
  const rowErrors = [];
  let successCount = 0;

  for (const [index, row] of rows.entries()) {
    try {
      if (!row.code || !row.name) {
        throw new Error("code and name are required.");
      }

      await prisma.supplier.upsert({
        where: {
          workspaceId_code: {
            workspaceId,
            code: row.code,
          },
        },
        create: {
          workspaceId,
          code: row.code,
          name: row.name,
          region: row.region || null,
          categories: normalizeCategories(row.categories),
          contactEmail: row.contact_email || null,
          tier: row.tier || null,
          score: Number.parseInt(row.score ?? "0", 10) || 0,
          quoteAccuracyPct: row.quote_accuracy_pct ? toDecimal(row.quote_accuracy_pct) : null,
        },
        update: {
          name: row.name,
          region: row.region || null,
          categories: normalizeCategories(row.categories),
          contactEmail: row.contact_email || null,
          tier: row.tier || null,
          score: Number.parseInt(row.score ?? "0", 10) || 0,
          quoteAccuracyPct: row.quote_accuracy_pct ? toDecimal(row.quote_accuracy_pct) : null,
        },
      });

      successCount += 1;
    } catch (error) {
      rowErrors.push({
        rowNumber: index + 2,
        message: error.message,
        row,
      });
    }
  }

  return { rowErrors, successCount, affectedSkuIds: [] };
}

async function processPricePointRows(workspaceId, rows, jobId) {
  const affectedSkuIds = new Set();
  const rowErrors = [];
  let successCount = 0;

  for (const [index, row] of rows.entries()) {
    try {
      if (!row.sku_code || !row.price || !row.recorded_at) {
        throw new Error("sku_code, price, and recorded_at are required.");
      }

      const sku = await prisma.sku.findFirst({
        where: {
          workspaceId,
          code: row.sku_code,
        },
      });

      if (!sku) {
        throw new Error(`Unknown SKU code: ${row.sku_code}`);
      }

      await prisma.pricePoint.create({
        data: {
          workspaceId,
          skuId: sku.id,
          importJobId: jobId,
          price: toDecimal(row.price),
          recordedAt: new Date(row.recorded_at),
          source: row.source || "csv",
        },
      });

      affectedSkuIds.add(sku.id);
      successCount += 1;
    } catch (error) {
      rowErrors.push({
        rowNumber: index + 2,
        message: error.message,
        row,
      });
    }
  }

  return { rowErrors, successCount, affectedSkuIds: [...affectedSkuIds] };
}

async function processQuoteRows(workspaceId, rows, jobId) {
  const affectedSkuIds = new Set();
  const rowErrors = [];
  let successCount = 0;

  for (const [index, row] of rows.entries()) {
    try {
      if (!row.sku_code || !row.supplier_code || !row.unit_price || !row.quote_date) {
        throw new Error("sku_code, supplier_code, unit_price, and quote_date are required.");
      }

      const [sku, supplier] = await Promise.all([
        prisma.sku.findFirst({
          where: {
            workspaceId,
            code: row.sku_code,
          },
        }),
        prisma.supplier.findFirst({
          where: {
            workspaceId,
            code: row.supplier_code,
          },
        }),
      ]);

      if (!sku) {
        throw new Error(`Unknown SKU code: ${row.sku_code}`);
      }

      if (!supplier) {
        throw new Error(`Unknown supplier code: ${row.supplier_code}`);
      }

      const existing = await prisma.supplierQuote.findFirst({
        where: {
          workspaceId,
          skuId: sku.id,
          supplierId: supplier.id,
          quoteDate: new Date(row.quote_date),
        },
      });

      if (existing) {
        await prisma.supplierQuote.update({
          where: { id: existing.id },
          data: {
            unitPrice: toDecimal(row.unit_price),
            leadTimeDays: row.lead_time_days ? Number.parseInt(row.lead_time_days, 10) : null,
            expiresAt: row.expires_at ? new Date(row.expires_at) : null,
            effectiveAt: row.effective_at ? new Date(row.effective_at) : null,
            notes: row.notes || null,
            isActive: row.is_active ? String(row.is_active).toLowerCase() !== "false" : true,
          },
        });
      } else {
        await prisma.supplierQuote.create({
          data: {
            workspaceId,
            skuId: sku.id,
            supplierId: supplier.id,
            importJobId: jobId,
            unitPrice: toDecimal(row.unit_price),
            leadTimeDays: row.lead_time_days ? Number.parseInt(row.lead_time_days, 10) : null,
            quoteDate: new Date(row.quote_date),
            expiresAt: row.expires_at ? new Date(row.expires_at) : null,
            effectiveAt: row.effective_at ? new Date(row.effective_at) : null,
            notes: row.notes || null,
            isActive: row.is_active ? String(row.is_active).toLowerCase() !== "false" : true,
          },
        });
      }

      affectedSkuIds.add(sku.id);
      successCount += 1;
    } catch (error) {
      rowErrors.push({
        rowNumber: index + 2,
        message: error.message,
        row,
      });
    }
  }

  return { rowErrors, successCount, affectedSkuIds: [...affectedSkuIds] };
}

export async function importCsv({ workspaceId, actorUserId, type, fileName, buffer }) {
  if (!buffer?.length) {
    throw badRequest("CSV file is required.");
  }

  const rows = parseCsvBuffer(buffer);
  const job = await createJob(workspaceId, actorUserId, type, fileName);

  let result;
  if (type === importJobTypes.skus) {
    result = await processSkuRows(workspaceId, rows, job.id);
  } else if (type === importJobTypes.suppliers) {
    result = await processSupplierRows(workspaceId, rows, job.id);
  } else if (type === importJobTypes.pricePoints) {
    result = await processPricePointRows(workspaceId, rows, job.id);
  } else if (type === importJobTypes.quotes) {
    result = await processQuoteRows(workspaceId, rows, job.id);
  } else {
    throw badRequest("Unsupported import type.");
  }

  const status =
    result.successCount === 0
      ? importJobStatuses.failed
      : result.rowErrors.length > 0
        ? importJobStatuses.partial
        : importJobStatuses.completed;

  const finalized = await finalizeJob(job.id, {
    status,
    totalRows: rows.length,
    successCount: result.successCount,
    failureCount: result.rowErrors.length,
    rowErrors: result.rowErrors,
  });

  for (const skuId of result.affectedSkuIds) {
    await reconcileSkuAlerts(workspaceId, skuId);
  }

  await recordAuditLog({
    workspaceId,
    actorUserId,
    entityType: "import_job",
    entityId: finalized.id,
    action: `import.${type.toLowerCase()}`,
    details: {
      totalRows: rows.length,
      successCount: result.successCount,
      failureCount: result.rowErrors.length,
    },
  });

  return mapImportJob(finalized);
}

export async function getImportJob(workspaceId, jobId) {
  const job = await prisma.importJob.findFirst({
    where: {
      workspaceId,
      id: jobId,
    },
  });

  if (!job) {
    throw notFound("Import job not found.");
  }

  return mapImportJob(job);
}
