/**
 * Yaroqlilik muddati nazorati — ProductBatch partiyalari bo'yicha xavf hisobi.
 *   qolgan kun     = muddat − bugun (manfiy = muddati o'tgan)
 *   sotiladi       = kunlik o'rtacha × max(0, qolgan kun)
 *   markdown xavfi = max(0, qoldiq − sotiladi)   // muddatgacha sotilmaydigan qism (chegirma kerak)
 * Kunlik o'rtacha — ProductSales (filial bo'yicha; ombor partiyasi uchun butun tarmoq).
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";
import { TASHKENT_OFFSET_MS, isoDay } from "@/lib/date";

export const EXPIRY_WARN_DAYS = 14; // shu kun ichida — ogohlantirish
export const EXPIRY_CRITICAL_DAYS = 3; // shu kun ichida — kritik

function tashDateStr(d: Date | number): string {
  return isoDay(new Date((typeof d === "number" ? d : d.getTime()) + TASHKENT_OFFSET_MS));
}
function dateFromStr(s: string): Date { return new Date(s + "T00:00:00.000Z"); }
function daysBetween(a: string, b: string): number {
  return Math.round((dateFromStr(a).getTime() - dateFromStr(b).getTime()) / 86_400_000);
}

export type ExpiryStatus = "expired" | "critical" | "warn" | "ok";

export type ExpiryBatch = {
  id: number;
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  branchId: number | null;
  location: string; // filial nomi yoki "Ombor"
  qty: number;
  expiryDate: string; // YYYY-MM-DD
  daysUntil: number; // manfiy = muddati o'tgan
  dailyAvg: number;
  willSell: number;
  atRisk: number; // markdown xavfi (muddatgacha sotilmaydigan miqdor)
  status: ExpiryStatus;
  note: string | null;
};

function statusOf(daysUntil: number): ExpiryStatus {
  if (daysUntil < 0) return "expired";
  if (daysUntil <= EXPIRY_CRITICAL_DAYS) return "critical";
  if (daysUntil <= EXPIRY_WARN_DAYS) return "warn";
  return "ok";
}

/** Barcha partiyalar xavf bilan — muddat bo'yicha (o'tgan/yaqin avval). */
export async function expiryRisk(): Promise<ExpiryBatch[]> {
  const batches = await prisma.productBatch.findMany({
    select: {
      id: true, productId: true, branchId: true, qty: true, expiryDate: true, note: true,
      product: { select: { code: true, name: true, category: { select: { name: true } } } },
      branch: { select: { name: true } },
    },
    orderBy: { expiryDate: "asc" },
  });
  if (batches.length === 0) return [];

  const pids = [...new Set(batches.map((b) => b.productId))];
  const range = await getDefaultRange();
  const startStr = isoDay(range.start);
  const endStr = isoDay(range.end);

  const avgRows = await prisma.$queryRaw<{ productId: number; branchId: number; daily: number }[]>(Prisma.sql`
    SELECT ps."productId", ps."branchId",
      (COALESCE(SUM(ps."soldQty"), 0) / NULLIF(COUNT(DISTINCT ps."periodStart"), 0))::float8 AS daily
    FROM "ProductSales" ps
    WHERE ps."productId" IN (${Prisma.join(pids)})
      AND ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date
    GROUP BY ps."productId", ps."branchId"
  `);

  const branchDaily = new Map<string, number>(); // `${pid}:${bid}` → kunlik
  const chainDaily = new Map<number, number>(); // pid → barcha filial yig'indisi
  for (const r of avgRows) {
    const d = r.daily || 0;
    branchDaily.set(`${r.productId}:${r.branchId}`, d);
    chainDaily.set(r.productId, (chainDaily.get(r.productId) ?? 0) + d);
  }

  const today = tashDateStr(Date.now());

  return batches.map((b) => {
    const expiryDate = isoDay(b.expiryDate);
    const daysUntil = daysBetween(expiryDate, today);
    const qty = Number(b.qty);
    const dailyAvg = b.branchId == null
      ? (chainDaily.get(b.productId) ?? 0)
      : (branchDaily.get(`${b.productId}:${b.branchId}`) ?? 0);
    const willSell = daysUntil > 0 ? dailyAvg * daysUntil : 0;
    const atRisk = daysUntil < 0 ? qty : Math.max(0, qty - willSell);
    return {
      id: b.id, productId: b.productId, code: b.product.code, name: b.product.name,
      sub: b.product.category?.name ?? null, branchId: b.branchId,
      location: b.branch?.name ?? "Ombor", qty, expiryDate, daysUntil,
      dailyAvg: Math.round(dailyAvg * 100) / 100,
      willSell: Math.round(willSell * 100) / 100,
      atRisk: Math.round(atRisk * 100) / 100,
      status: statusOf(daysUntil), note: b.note,
    };
  });
}

// ── Import parseri (Excel/CSV → {code, qty, expiry}) ────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.trunc(n);
}

/** Turli sana formatlaridan YYYY-MM-DD (Date obyekti, Excel serial, yoki matn). */
export function parseExpiry(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return isoDay(v);
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial (1900 epox) — XLSX cellDates ishlamasa
    const ms = Math.round((v - 25569) * 86_400_000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : isoDay(d);
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s); // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(s); // DD.MM.YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Array-of-arrays (sheet_to_json header:1) dan {code, qty, expiry} qatorlari.
 * Ustunlar sarlavha bo'yicha: kod / muddat / qoldiq; topilmasa 1-,2-,3-ustun.
 */
export function parseBatchRows(aoa: unknown[][]): { code: number; qty: number; expiry: string }[] {
  if (!aoa.length) return [];
  const header = (aoa[0] ?? []).map((v) => String(v ?? "").trim().toLowerCase());
  const find = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const codeCol = find(/kod|code|артикул|товар/, 0);
  const expCol = find(/muddat|срок|годн|expir|sana|дата/, 1);
  const qtyCol = find(/qoldiq|ostatok|остаток|qty|miqdor|кол|soni|qold/, 2);
  const startRow = toInt(aoa[0]?.[codeCol]) == null ? 1 : 0;

  const out: { code: number; qty: number; expiry: string }[] = [];
  for (let i = startRow; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const code = toInt(row[codeCol]);
    const qty = toNum(row[qtyCol]);
    const expiry = parseExpiry(row[expCol]);
    if (code == null || code <= 0 || qty == null || !expiry) continue;
    out.push({ code, qty, expiry });
  }
  return out;
}
