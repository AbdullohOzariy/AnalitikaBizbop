/**
 * Marja (foyda ulushi) chegaralari — YAGONA manba.
 *
 * Sabab: chegaralar uch joyda uch xil edi (miniapp 20/12, dashboard-v2 30/15,
 * baza/sotuv 15/0). Natijada bir xil marja bir ekranda yashil, boshqasida
 * qizil ko'rinardi — xodim qaysi ko'rsatkichga ishonishni bilmasdi.
 *
 * Helper ATAYLAB rang emas, semantik "tone" qaytaradi: har iste'molchining
 * palitrasi boshqacha (miniapp — CSS o'zgaruvchilar, dashboard-v2 — Recharts
 * hex, baza/sotuv — StatCard `tone` propi). Rang qaytarilsa ularning hech
 * biriga to'g'ridan-to'g'ri tushmasdi.
 *
 * Chegaralarni o'zgartirish kerak bo'lsa — FAQAT shu fayl tahrirlanadi.
 */

/** Yaxshi marja quyi chegarasi (%) — bundan yuqorisi "good". */
export const MARJA_YAXSHI = 20;
/** Qoniqarli marja quyi chegarasi (%) — bundan pastda "bad". */
export const MARJA_QONIQARLI = 12;

/**
 * `none` — marja hisoblab bo'lmaydi (tannarx yo'q/savdo 0). Bu "yomon" EMAS:
 * ma'lumot yetishmasligini yomon natija sifatida bo'yash noto'g'ri signal.
 */
export type MarjaTone = "good" | "ok" | "bad" | "none";

export function marjaTone(marja: number | null | undefined): MarjaTone {
  if (marja == null || !Number.isFinite(marja)) return "none";
  if (marja >= MARJA_YAXSHI) return "good";
  if (marja >= MARJA_QONIQARLI) return "ok";
  return "bad";
}
