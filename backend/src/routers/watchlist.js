import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/response.js";
import { listWatchlist } from "../services/watchlistService.js";
import { toCsv } from "../utils/csv.js";

export const watchlistRouter = express.Router();

watchlistRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listWatchlist(req.auth.workspaceId, req.query);
    sendData(
      res,
      {
        items: result.items,
        summary: result.summary,
      },
      result.meta
    );
  })
);

watchlistRouter.get(
  "/export",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listWatchlist(req.auth.workspaceId, {
      ...req.query,
      page: 1,
      pageSize: 10000,
    });

    const csv = toCsv(
      result.items.map((item) => ({
        sku_code: item.sku.code,
        sku_name: item.sku.name,
        category: item.sku.category,
        best_quote: item.bestQuote.display,
        spread: item.spread.display,
        trend_7d: item.trend7d.display,
        supplier: item.supplier?.name ?? "",
        status: item.status.label,
      }))
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="watchlist.csv"');
    res.status(200).send(csv);
  })
);
