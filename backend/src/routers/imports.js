import express from "express";
import multer from "multer";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendCreated, sendData } from "../utils/response.js";
import { badRequest } from "../utils/errors.js";
import { getImportJob, importCsv } from "../services/importService.js";
import { importJobTypes } from "../constants/enums.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

export const importsRouter = express.Router();

function createImportHandler(type) {
  return [
    requireAuth,
    requireRoles("ANALYST"),
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw badRequest("CSV file is required in the `file` form field.");
      }

      const result = await importCsv({
        workspaceId: req.auth.workspaceId,
        actorUserId: req.auth.user.id,
        type,
        fileName: req.file.originalname,
        buffer: req.file.buffer,
      });

      sendCreated(res, result);
    }),
  ];
}

importsRouter.post("/skus", ...createImportHandler(importJobTypes.skus));
importsRouter.post("/suppliers", ...createImportHandler(importJobTypes.suppliers));
importsRouter.post("/price-points", ...createImportHandler(importJobTypes.pricePoints));
importsRouter.post("/quotes", ...createImportHandler(importJobTypes.quotes));

importsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await getImportJob(req.auth.workspaceId, req.params.id);
    sendData(res, result);
  })
);
