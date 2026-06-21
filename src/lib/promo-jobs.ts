import { prisma } from "@/lib/prisma";

/**
 * Muddati o'tgan FAOL aksiyalarni avtomatik ENDED qiladi (kunlik cron).
 * Faqat ACTIVE → ENDED: DRAFT (qoralama) va CANCELLED tegilmaydi.
 * Bugun — Toshkent (UTC+5); endDate < bugun bo'lsa aksiya tugagan deb hisoblanadi.
 * Qaytaradi: holati o'zgartirilgan aksiyalar soni.
 */
export async function endExpiredPromos(): Promise<number> {
  const todayStr = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const today = new Date(todayStr + "T00:00:00.000Z");
  const res = await prisma.promoCampaign.updateMany({
    where: { status: "ACTIVE", endDate: { not: null, lt: today } },
    data: { status: "ENDED" },
  });
  return res.count;
}
