/**
 * Markaziy ombor qoldig'i — kunlik import (kod + qoldiq) bilan yangilanadi.
 * WarehouseStock = snapshot (productId → qty). Ro'yxat + import parseri.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export type WarehouseRow = {
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  qty: number;
};

export const WAREHOUSE_PAGE = 50;

/** Ombor qoldig'i ro'yxati — qidiruv (nom/kod) + pagination. */
export async function warehouseStockList(opts: { q?: string; page?: number }): Promise<{
  rows: WarehouseRow[]; total: number; pageSize: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const qNum = q && /^\d+$/.test(q) ? Number(q) : null;
  const where: Prisma.WarehouseStockWhereInput = q
    ? { product: { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(qNum != null ? [{ code: qNum }] : [])] } }
    : {};
  const [rows, total] = await Promise.all([
    prisma.warehouseStock.findMany({
      where,
      select: { productId: true, qty: true, product: { select: { code: true, name: true, category: { select: { name: true } } } } },
      orderBy: { product: { name: "asc" } },
      skip: (page - 1) * WAREHOUSE_PAGE,
      take: WAREHOUSE_PAGE,
    }),
    prisma.warehouseStock.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      productId: r.productId, code: r.product.code, name: r.product.name,
      sub: r.product.category?.name ?? null, qty: Number(r.qty),
    })),
    total, pageSize: WAREHOUSE_PAGE,
  };
}

// ── Import parseri (Excel/CSV → {code, qty}[]) ──────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.trunc(n);
}

/**
 * Array-of-arrays (sheet_to_json header:1) dan {code, qty} qatorlarini ajratadi.
 * Ustunlar sarlavha bo'yicha aniqlanadi (kod / qoldiq); topilmasa — 1- va 2-ustun.
 */
export function parseWarehouseRows(aoa: unknown[][]): { code: number; qty: number }[] {
  if (!aoa.length) return [];
  const header = (aoa[0] ?? []).map((v) => String(v ?? "").trim().toLowerCase());
  const find = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const codeCol = find(/kod|code|артикул|товар/, 0);
  const qtyCol = find(/qoldiq|ostatok|остаток|qty|miqdor|кол|soni|qold/, 1);
  // Birinchi qator sarlavha bo'lsa (kod katagi raqam emas) — o'tkazib yuboramiz
  const startRow = toInt(aoa[0]?.[codeCol]) == null ? 1 : 0;

  const out: { code: number; qty: number }[] = [];
  for (let i = startRow; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const code = toInt(row[codeCol]);
    const qty = toNum(row[qtyCol]);
    if (code == null || code <= 0 || qty == null) continue;
    out.push({ code, qty });
  }
  return out;
}
