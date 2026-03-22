import { PrismaClient } from "@prisma/client";

const globalKey = "__pricetoolPrisma";

export const prisma =
  globalThis[globalKey] ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis[globalKey] = prisma;
}
