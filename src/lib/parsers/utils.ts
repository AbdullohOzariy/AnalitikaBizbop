import { createHash } from "node:crypto";

/**
 * "15 142 029,99" yoki "15,142,029.99" yoki number/Excel-serial → number
 * Bo'sh / null → null
 */
export function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const cleaned = raw
    .replace(/ /g, "") // non-breaking space
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  // Agar bir nechta nuqta bo'lsa (mas. ming-ajratuvchi sifatida) — oxirgisini saqlaymiz
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (cleaned.split(".").length > 2 && lastDot !== -1) {
    normalized =
      cleaned.slice(0, lastDot).replaceAll(".", "") + "." + cleaned.slice(lastDot + 1);
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * 1C mahsulot/kategoriya kodi → butun son.
 * 1C eksportida kod 1000 dan katta bo'lsa probelli MATN bo'ladi ("50 911"),
 * kichik bo'lsa raqam (299). Ikkalasini ham qabul qilamiz.
 * "Итого" yoki raqam bo'lmagan matn → null.
 */
export function parseCode(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\s/g, ""); // \s NBSP ( ) va tor-NBSP ( ) ni ham qamraydi
  if (!/^\d+$/.test(digits)) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * "DD.MM.YYYY" yoki "DD/MM/YYYY" yoki Date object → Date (UTC, kun boshi)
 */
export function parseDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return toUtcDate(raw);
  if (typeof raw === "number") {
    // Excel serial date (1900 epoch)
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? toUtcDate(d) : null;
  }
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/**
 * Excel sanasini UTC ning kun boshiga yaqinlashtiramiz.
 * SheetJS ba'zan ~10 soniya drift bilan o'qiydi (1900 epoch correction),
 * shuning uchun eng yaqin kunga (UTC ms / 86400000) yumaloqlaymiz.
 */
function toUtcDate(d: Date): Date {
  const dayMs = 86_400_000;
  return new Date(Math.round(d.getTime() / dayMs) * dayMs);
}

/** "01 aprel" / "1 aprel" + yil → Date */
const UZ_MONTHS: Record<string, number> = {
  yanvar: 0,
  fevral: 1,
  mart: 2,
  aprel: 3,
  may: 4,
  iyun: 5,
  iyul: 6,
  avgust: 7,
  sentabr: 8,
  sentyabr: 8,
  oktabr: 9,
  oktyabr: 9,
  noyabr: 10,
  dekabr: 11,
};
export function parseUzDayMonth(raw: unknown, year: number): Date | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})\s+([a-zа-я]+)$/);
  if (!m) return null;
  const [, day, monthName] = m;
  const month = UZ_MONTHS[monthName];
  if (month === undefined) return null;
  return new Date(Date.UTC(year, month, Number(day)));
}

/** "Продажи товаров за период с 01.04.2026 по 30.04.2026" → { start, end } */
export function parseRussianPeriod(
  raw: unknown
): { start: Date; end: Date } | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(
    /с\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+по\s+(\d{1,2}\.\d{1,2}\.\d{4})/i
  );
  if (!m) return null;
  const start = parseDate(m[1]);
  const end = parseDate(m[2]);
  if (!start || !end) return null;
  // Teskari oraliq (start > end) — pro-rate 0 summa berib, xato jim o'tib ketardi.
  if (start.getTime() > end.getTime()) return null;
  return { start, end };
}

export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function normalizeName(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}
