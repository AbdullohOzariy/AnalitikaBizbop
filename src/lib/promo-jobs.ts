import { prisma } from "@/lib/prisma";
import { todayTashkentISO } from "@/lib/date";

/**
 * Muddati o'tgan FAOL aksiyalarni avtomatik ENDED qiladi (kunlik cron).
 * Faqat ACTIVE → ENDED: DRAFT (qoralama) va CANCELLED tegilmaydi.
 * Bugun — Toshkent (UTC+5); endDate < bugun bo'lsa aksiya tugagan deb hisoblanadi.
 * Qaytaradi: holati o'zgartirilgan aksiyalar soni.
 */
export async function endExpiredPromos(): Promise<number> {
  const todayStr = todayTashkentISO();
  const today = new Date(todayStr + "T00:00:00.000Z");
  const res = await prisma.promoCampaign.updateMany({
    where: { status: "ACTIVE", endDate: { not: null, lt: today } },
    data: { status: "ENDED" },
  });
  return res.count;
}
