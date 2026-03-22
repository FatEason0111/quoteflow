import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/response.js";
import { getSkuDetail } from "../services/skuService.js";

export const skuRouter = express.Router();

skuRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await getSkuDetail(req.auth.workspaceId, req.params.id);
    sendData(res, detail);
  })
);
