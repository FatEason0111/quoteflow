import { env } from "../config/env.js";

export function getHealthStatus() {
  return {
    status: "ok",
    service: env.appName,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    version: env.appVersion,
  };
}
