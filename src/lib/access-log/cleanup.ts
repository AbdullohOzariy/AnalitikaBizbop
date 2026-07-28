/**
 * Kirishlar jurnalini tozalash — 1 yildan eskisi o'chiriladi (kunlik cron).
 *
 * PAKETLI o'chirish (5000 tadan): bitta ulkan DELETE Neon'da statement-timeout'ga
 * urilishi va jadvalni uzoq qulflab turishi mumkin. `ctid` bo'yicha kichik
 * paketlar tez commit bo'ladi va boshqa yozuvlarga xalaqit qilmaydi.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isoDay } from "@/lib/date";

/** Saqlash muddati (kun). Ikkala jadval uchun ham bir xil — 1 yil. */
const RETENTION_DAYS = Math.max(7, Number(process.env.ACCESS_LOG_RETENTION_DAYS) || 365);

/** Bitta tranzaksiyada o'chiriladigan qatorlar soni. */
const PAKET = 5_000;

/** Identifikator qo'shtirnoq ichida. Argumentlar shu modul ichida QAT'IY literal
 *  (foydalanuvchi kiritmasi emas) — injeksiya yo'li yo'q. */
const ident = (s: string) => Prisma.raw(`"${s}"`);

async function paketliOchirish(
  jadval: "AccessEvent" | "AccessSession",
  ustun: "createdAt" | "dayKey",
  cutoff: Date | string
): Promise<number> {
  let jami = 0;
  // Cheksiz sikldan himoya: eng ko'pi 200 paket (1M qator) — undan ortig'i
  // ertangi ishga qoladi (jadval baribir kunlik tozalanadi).
  for (let i = 0; i < 200; i++) {
    const n = await prisma.$executeRaw`
      DELETE FROM ${ident(jadval)}
      WHERE ctid IN (
        SELECT ctid FROM ${ident(jadval)}
        WHERE ${ident(ustun)} < ${cutoff}
        LIMIT ${PAKET}
      )`;
    jami += n;
    if (n < PAKET) break;
  }
  return jami;
}

export async function cleanupAccessLog(): Promise<{ events: number; sessions: number }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);

  // AccessEvent — `createdAt` (DESC indeks oralig'ni ham xizmat qiladi).
  const events = await paketliOchirish("AccessEvent", "createdAt", cutoff);
  // AccessSession — ATAYLAB `dayKey`, `startedAt` EMAS: `startedAt` boshlovchi
  // ustun bo'lgan indeks yo'q (faqat [userId, startedAt]) va DELETE butun jadvalni
  // skanlardi. `dayKey` esa indekslangan va startedAt ning Toshkent kuni — retention
  // uchun ayni bir xil ma'no.
  const sessions = await paketliOchirish("AccessSession", "dayKey", isoDay(cutoff));

  // Katta DELETE'dan keyin planner statistikasi eskiradi. ANALYZE satr
  // QAYTARMAYDI — shuning uchun $executeRaw emas, $queryRawUnsafe bilan.
  if (events + sessions > 0) {
    await prisma.$queryRawUnsafe('ANALYZE "AccessEvent"').catch(() => {});
    await prisma.$queryRawUnsafe('ANALYZE "AccessSession"').catch(() => {});
  }

  return { events, sessions };
}
