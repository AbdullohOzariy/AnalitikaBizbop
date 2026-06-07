import "dotenv/config";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const rawUrl = process.env.DATABASE_URL ?? "";
const isLocal = rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1");

// pg-connection-string warns about sslmode=require/prefer/verify-ca in v9.
// Replace them with verify-full (same behavior, no warning).
const connectionString = isLocal
  ? rawUrl
  : rawUrl.replace(/sslmode=(prefer|require|verify-ca)/g, "sslmode=verify-full");

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  // Neon pooler limiti (free ~10) — margin qoldiramiz; ulanish o'rnatish qimmat
  // bo'lgani uchun idle ulanishni uzoqroq ushlaymiz.
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
