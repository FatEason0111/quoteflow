import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/response.js";
import { getAlertDetail, listAlerts } from "../services/alertService.js";

export const alertsRouter = express.Router();

alertsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await listAlerts(req.auth.workspaceId, req.query);
    sendData(res, result.items, result.meta);
  })
);

alertsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await getAlertDetail(req.auth.workspaceId, req.params.id);
    sendData(res, detail);
  })
);
