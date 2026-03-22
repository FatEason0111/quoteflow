import express from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/response.js";
import { getSettings, updateSettings } from "../services/settingsService.js";

export const settingsRouter = express.Router();

settingsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const settings = await getSettings(req.auth.workspaceId);
    sendData(res, settings);
  })
);

settingsRouter.patch(
  "/",
  requireAuth,
  requireRoles("ADMIN"),
  asyncHandler(async (req, res) => {
    const settings = await updateSettings(req.auth.workspaceId, req.auth.user.id, req.body);
    sendData(res, settings);
  })
);
