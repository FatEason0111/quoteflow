import express from "express";
import { env } from "../config/env.js";
import { sendData } from "../utils/response.js";
import { getHealthStatus } from "../services/healthService.js";
import { authRouter } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { watchlistRouter } from "./watchlist.js";
import { skuRouter } from "./skus.js";
import { alertsRouter } from "./alerts.js";
import { suppliersRouter } from "./suppliers.js";
import { settingsRouter } from "./settings.js";
import { quotePackagesRouter } from "./quotePackages.js";
import { importsRouter } from "./imports.js";

export const apiRouter = express.Router();

apiRouter.get("/health", (_req, res) => {
  sendData(res, getHealthStatus());
});

apiRouter.get("/version", (_req, res) => {
  sendData(res, {
    version: env.appVersion,
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/watchlist", watchlistRouter);
apiRouter.use("/skus", skuRouter);
apiRouter.use("/alerts", alertsRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/quote-packages", quotePackagesRouter);
apiRouter.use("/imports", importsRouter);
