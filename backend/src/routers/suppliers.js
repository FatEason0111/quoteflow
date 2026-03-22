import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/response.js";
import { getSupplierDetail, listSuppliers } from "../services/supplierService.js";

export const suppliersRouter = express.Router();

suppliersRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listSuppliers(req.auth.workspaceId, req.query);
    sendData(res, result.items, result.meta);
  })
);

suppliersRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await getSupplierDetail(req.auth.workspaceId, req.params.id);
    sendData(res, detail);
  })
);
