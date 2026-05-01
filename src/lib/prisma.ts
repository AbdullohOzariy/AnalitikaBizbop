import "dotenv/config";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const rawUrl = process.env.DATABASE_URL ?? "";
const isLocal = rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1");

// Strip sslmode from the URL so pg-connection-string doesn't emit a deprecation
// warning. SSL is handled explicitly below (equivalent to sslmode=verify-full).
let connectionString = rawUrl;
if (!isLocal) {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete("sslmode");
    connectionString = u.toString();
  } catch {
    // not a valid URL — use as-is
  }
}

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: true },
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
