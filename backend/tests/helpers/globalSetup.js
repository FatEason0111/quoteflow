import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(currentDir, "../..");
const prismaBin = path.join(backendDir, "node_modules/.bin/prisma");
const baseDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!baseDatabaseUrl) {
  throw new Error("Set TEST_DATABASE_URL or DATABASE_URL before running tests.");
}

const schemaName = `test_${crypto.randomUUID().replace(/-/g, "")}`;
const url = new URL(baseDatabaseUrl);
url.searchParams.set("schema", schemaName);

process.env.DATABASE_URL = url.toString();
process.env.DISABLE_RECONCILIATION_JOB = "true";
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? "4";

execFileSync(prismaBin, ["db", "push", "--skip-generate", "--force-reset"], {
  cwd: backendDir,
  env: process.env,
  stdio: "pipe",
});
