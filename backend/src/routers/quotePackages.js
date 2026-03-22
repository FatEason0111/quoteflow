import express from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendCreated, sendData } from "../utils/response.js";
import {
  createQuotePackage,
  decideQuotePackageApproval,
  dispatchQuotePackage,
  getQuotePackageDetail,
  submitQuotePackage,
  updateQuotePackage,
} from "../services/quotePackageService.js";

export const quotePackagesRouter = express.Router();

quotePackagesRouter.post(
  "/",
  requireAuth,
  requireRoles("BUYER"),
  asyncHandler(async (req, res) => {
    const result = await createQuotePackage(req.auth.workspaceId, req.auth.user, req.body);
    sendCreated(res, result);
  })
);

quotePackagesRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getQuotePackageDetail(req.auth.workspaceId, req.params.id);
    sendData(res, result);
  })
);

quotePackagesRouter.patch(
  "/:id",
  requireAuth,
  requireRoles("BUYER"),
  asyncHandler(async (req, res) => {
    const result = await updateQuotePackage(req.auth.workspaceId, req.params.id, req.auth.user, req.body);
    sendData(res, result);
  })
);

quotePackagesRouter.post(
  "/:id/submit",
  requireAuth,
  requireRoles("BUYER"),
  asyncHandler(async (req, res) => {
    const result = await submitQuotePackage(req.auth.workspaceId, req.params.id, req.auth.user);
    sendData(res, result);
  })
);

quotePackagesRouter.post(
  "/:id/approvals/:stepId/decision",
  requireAuth,
  requireRoles("APPROVER", "FINANCE_APPROVER"),
  asyncHandler(async (req, res) => {
    const result = await decideQuotePackageApproval(
      req.auth.workspaceId,
      req.params.id,
      req.params.stepId,
      req.auth.user,
      req.body
    );
    sendData(res, result);
  })
);

quotePackagesRouter.post(
  "/:id/dispatch",
  requireAuth,
  requireRoles("BUYER"),
  asyncHandler(async (req, res) => {
    const result = await dispatchQuotePackage(req.auth.workspaceId, req.params.id, req.auth.user, req.body);
    sendData(res, result);
  })
);
