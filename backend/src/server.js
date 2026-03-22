import { createServer } from "node:http";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";
import { startReconciliationJob } from "./services/reconciliationJob.js";

const app = createApp();
const server = createServer(app);

async function bootstrap() {
  await prisma.$connect();

  if (!env.disableReconciliationJob) {
    startReconciliationJob();
  }

  server.listen(env.port, () => {
    console.log(`[${env.appName}] listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch(async (error) => {
  console.error(`[${env.appName}] failed to start`, error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
