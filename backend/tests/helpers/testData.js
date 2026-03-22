import { prisma } from "../../src/lib/prisma.js";
import { seedDemoData } from "../../prisma/seed-data.js";

export async function seedTestData() {
  return seedDemoData();
}

export async function findUserByEmail(email) {
  return prisma.user.findFirstOrThrow({
    where: {
      email,
    },
  });
}

export async function getWorkspace() {
  return prisma.workspace.findFirstOrThrow();
}

export async function loginAs(agent, email, password = "QuoteFlow123!") {
  return agent.post("/api/auth/login").send({
    email,
    password,
  });
}
