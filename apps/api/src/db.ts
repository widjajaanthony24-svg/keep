import { PrismaClient } from "@prisma/client";

// A single shared Prisma instance, reused across requests (and across
// hot-reloads in dev) rather than opening a new pool per request.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
