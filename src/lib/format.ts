import { TASHKENT_OFFSET_MS } from "@/lib/date";

/**
 * UZS formatlash: katta sonni qisqartirilgan ko'rinishda (8.27 mlrd) yoki to'liq.
 */
export function formatUZS(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("uz-UZ", { maximumFractionDigits: 2 }) + " mlrd";
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString("uz-UZ", { maximumFractionDigits: 1 }) + " mln";
    if (Math.abs(n) >= 1_000) return (n / 1_000).toLocaleString("uz-UZ", { maximumFractionDigits: 1 }) + " ming";
  }
  return n.toLocaleString("uz-UZ", { maximumFractionDigits: 0 });
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("uz-UZ", { maximumFractionDigits: 0 });
}

/** Prisma Decimal (yoki har qanday qiymat) → number; NaN/parse xatosi → 0. */
export function decimalToNumber(n: unknown): number {
  const v = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  return isNaN(v) ? 0 : v;
}

export function formatPercent(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals) + "%";
}

export function formatDateUZ(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Deterministik "DD.MM.YYYY HH:mm" (Toshkent, UTC+5 — DST yo'q).
 * toLocaleString o'rniga: server (Node ICU) va brauzer locale'lari farq qilganda
 * hydration mismatch bermasin; vaqt mintaqasi qat'iy — qayerda render bo'lsa ham bir xil.
 */
export function formatDateTimeUZ(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const t = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export function formatDateRangeUZ(start: Date | string, end: Date | string): string {
  return `${formatDateUZ(start)} – ${formatDateUZ(end)}`;
}

