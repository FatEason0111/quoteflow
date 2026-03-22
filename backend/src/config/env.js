import "dotenv/config";

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const parseOrigins = (value) =>
  String(value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const required = (name, fallback = undefined) => {
  const value = process.env[name] ?? fallback;
  if (value == null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const env = {
  appName: process.env.APP_NAME ?? "quoteflow-api",
  appVersion: process.env.APP_VERSION ?? "v0.0.1",
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInteger(process.env.PORT, 3000),
  databaseUrl: required("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pricetool?schema=public"),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "pricetool_session",
  sessionTtlHours: parseInteger(process.env.SESSION_TTL_HOURS, 24),
  sessionRememberDays: parseInteger(process.env.SESSION_REMEMBER_DAYS, 30),
  bcryptRounds: parseInteger(process.env.BCRYPT_ROUNDS, 10),
  reconciliationIntervalMinutes: parseInteger(process.env.RECONCILIATION_INTERVAL_MINUTES, 15),
  disableReconciliationJob: parseBoolean(process.env.DISABLE_RECONCILIATION_JOB, false),
};

export const isProduction = env.nodeEnv === "production";
