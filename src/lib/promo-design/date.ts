/**
 * Aksiya davri sanasini o'zbekcha "25-iyundan 1-iyulgacha" ko'rinishida formatlaydi.
 * end null bo'lsa (BIZBOP_NARX doimiy) → "25-iyundan boshlab".
 * Sanalar @db.Date (UTC yarim tun) — UTC komponentlar olinadi.
 *
 * MUHIM: bannerda tugash sanasi BIR KUN OLDIN ko'rsatiladi — endDate amaliyotda
 * "narx asliga qaytadigan kun" (09.07–16.07 belgilansa aksiya 16.07 da ishlamaydi),
 * mijoz tushunmovchiligi bo'lmasligi uchun oxirgi AMAL QILADIGAN kun (15.07) yoziladi.
 * Bir kunlik aksiya (end = start + 1 kun) → "9-iyul kuni".
 */
const OYLAR_UZ = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
] as const;

const KUN_MS = 86_400_000;

export function formatPromoDateRange(start: Date | string, end: Date | string | null): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const startStr = `${s.getUTCDate()}-${OYLAR_UZ[s.getUTCMonth()]}dan`;
  if (!end) return `${startStr} boshlab`;
  const e = typeof end === "string" ? new Date(end) : end;
  const shown = new Date(e.getTime() - KUN_MS); // oxirgi amal qiladigan kun
  if (shown.getTime() <= s.getTime()) return `${s.getUTCDate()}-${OYLAR_UZ[s.getUTCMonth()]} kuni`;
  return `${startStr} ${shown.getUTCDate()}-${OYLAR_UZ[shown.getUTCMonth()]}gacha`;
}
