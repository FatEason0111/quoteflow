import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/response.js";
import { getOverview } from "../services/dashboardService.js";

export const dashboardRouter = express.Router();

dashboardRouter.get(
  "/overview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const overview = await getOverview(req.auth.workspaceId);
    sendData(res, overview);
  })
);
