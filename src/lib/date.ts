// Sana/vaqt yordamchilari — MARKAZLASHGAN. Ilgari `parseDate`/`nowTashkent`/`isoDay`
// kabi funksiyalar 30+ joyda qo'lda takrorlanardi (ba'zisi Feb-31 ni jimgina rollover
// qilardi, ba'zisi validatsiyasiz) — repo tarixidagi eng ko'p bug bergan "Fakt=0" sinfi.
// Bu modul yagona, izchil, qat'iy validatsiyali manba. Namoyish uchun formatlash —
// `format.ts` da (formatDateUZ/formatDateTimeUZ).

/** Toshkent = UTC+5, yozgi vaqt (DST) yo'q — offset qat'iy. */
export const TASHKENT_OFFSET_MS = 5 * 3_600_000;

/**
 * Hozirgi payt Toshkent "devoriy vaqti"da: UTC epoch'ga +5s qo'shilgan Date.
 * `getUTC*()` metodlari Toshkent mahalliy qiymatini beradi (getUTCHours() = Toshkent soati).
 * ESLATMA: bu Date'ni `.getHours()` (mahalliy) bilan o'qimang — faqat `getUTC*` bilan.
 */
export function nowTashkent(): Date {
  return new Date(Date.now() + TASHKENT_OFFSET_MS);
}

/** Date -> "YYYY-MM-DD" (UTC kalendar kuni). `nowTashkent()` bilan birga — Toshkent kuni. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Bugungi sana Toshkent bo'yicha "YYYY-MM-DD". */
export function todayTashkentISO(): string {
  return isoDay(nowTashkent());
}

/**
 * searchParams'dagi "YYYY-MM-DD" -> UTC yarim tun Date. Noto'g'ri/bo'sh -> `fallback`
 * (default undefined). Qat'iy: mavjud bo'lmagan kalendar sana ("2026-02-31", "2026-13-01)
 * JIM rollover qilinmaydi — fallback qaytaradi (ilgari `Date.UTC(...)` variantlari
 * buni jimgina keyingi oyга surardi).
 */
export function parseDateParam(
  s: string | null | undefined,
  fallback?: Date
): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime())) return fallback;
  // Belt-and-suspenders: rollover bo'lsa (engine ruxsat bersa) — rad etamiz.
  if (isoDay(d) !== s) return fallback;
  return d;
}
