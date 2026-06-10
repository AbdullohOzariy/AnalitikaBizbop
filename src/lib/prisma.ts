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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

// Pool ham globalThis'da — dev hot-reload'da modul qayta yuklanganda faqat client
// emas, pool ham qayta ishlatilsin (aks holda har reload yangi ulanishlar ochib,
// Neon pooler limitini (free ~10) yeb qo'yadi).
const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: true },
    // Neon Launch plan — pooler limiti yuqori (free'dagi ~10 emas); sahifalar
    // 4-5 parallel so'rov ochadi, 10 ta ulanish navbatsiz xizmat qiladi.
    max: 10,
    // Yangi ulanish (TLS + pooler auth) ~0.7-1.3s turadi — o'lchangan. 30s idle'da
    // deyarli har tashrif shu solig'ni to'lardi; 10 daqiqa ushlab turamiz.
    idleTimeoutMillis: 600_000,
    keepAlive: true,
    connectionTimeoutMillis: 5_000,
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
