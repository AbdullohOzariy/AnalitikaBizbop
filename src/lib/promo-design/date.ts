/**
 * Aksiya davri sanasini o'zbekcha "25-iyundan 1-iyulgacha" ko'rinishida formatlaydi.
 * end null bo'lsa (BIZBOP_NARX doimiy) → "25-iyundan boshlab".
 * Sanalar @db.Date (UTC yarim tun) — UTC komponentlar olinadi.
 */
const OYLAR_UZ = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
] as const;

export function formatPromoDateRange(start: Date | string, end: Date | string | null): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const startStr = `${s.getUTCDate()}-${OYLAR_UZ[s.getUTCMonth()]}dan`;
  if (!end) return `${startStr} boshlab`;
  const e = typeof end === "string" ? new Date(end) : end;
  return `${startStr} ${e.getUTCDate()}-${OYLAR_UZ[e.getUTCMonth()]}gacha`;
}
