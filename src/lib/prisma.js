import { PrismaClient } from "@prisma/client";

// Reuse the same client across hot reloads in dev
const globalForPrisma = globalThis;
export const prisma = globalForPrisma._prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
if (process.env.NODE_ENV === "development") globalForPrisma._prisma = prisma;
