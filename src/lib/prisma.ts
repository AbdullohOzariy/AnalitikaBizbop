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
function makePool() {
  const p = new Pool({
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
  // KRITIK: Neon idle ulanishni serverda uzsa ("Connection terminated unexpectedly"),
  // pg idle-client'da 'error' hodisasini chiqaradi. Ishlovchi bo'lmasa — bu Node uchun
  // uncaughtException bo'lib, JARAYONNI QULATADI (sahifalar "couldn't load"). Shu yerda
  // yutib, faqat loglaymiz — pg uzilgan ulanishni o'zi tashlaydi, keyingi so'rov yangisini ochadi.
  p.on("error", (err) => {
    console.error("[pg pool] idle client xatosi (yutildi):", err instanceof Error ? err.message : err);
  });
  return p;
}

const pool = globalForPrisma.pgPool ?? makePool();

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
