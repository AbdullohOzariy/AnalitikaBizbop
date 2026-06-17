/**
 * Ombor → filial taqsimot tavsiyasi.
 *   maqsad  = kunlik sotuv × targetDays
 *   ehtiyoj = max(0, maqsad − filial qoldig'i)
 *   tavsiya = min(ehtiyoj, ombor qoldig'i)
 * Filial qoldig'i/sotuvi — ProductSales (oxirgi snapshot + davr o'rtachasi).
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";

export type DistSuggest = {
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  warehouseQty: number;
  branchStock: number;
  dailyAvg: number;
  target: number;
  need: number;
  suggest: number;
};

type RawRow = {
  productId: number; code: number; name: string; sub: string | null;
  warehouseQty: number; branchStock: number; dailyAvg: number;
};

/** Filial uchun taqsimot tavsiyasi — tavsiya > 0 bo'lgan SKU'lar (ombor + ehtiyoj bor). */
export async function branchDistributionSuggest(branchId: number, targetDays: number): Promise<DistSuggest[]> {
  const range = await getDefaultRange();
  const startStr = range.start.toISOString().slice(0, 10);
  const endStr = range.end.toISOString().slice(0, 10);

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH wh AS (
      SELECT "productId", "qty"::float8 AS qty FROM "WarehouseStock" WHERE "qty" > 0
    ),
    bstock AS (
      SELECT DISTINCT ON (ps."productId") ps."productId", ps."stockQty"::float8 AS stock
      FROM "ProductSales" ps
      WHERE ps."branchId" = ${branchId}
      ORDER BY ps."productId", ps."periodEnd" DESC
    ),
    bavg AS (
      SELECT ps."productId",
             (COALESCE(SUM(ps."soldQty"), 0) / NULLIF(COUNT(DISTINCT ps."periodStart"), 0))::float8 AS daily
      FROM "ProductSales" ps
      WHERE ps."branchId" = ${branchId}
        AND ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date
      GROUP BY ps."productId"
    )
    SELECT wh."productId" AS "productId", p.code, p.name, c.name AS sub,
           wh.qty AS "warehouseQty",
           COALESCE(bs.stock, 0) AS "branchStock",
           COALESCE(ba.daily, 0) AS "dailyAvg"
    FROM wh
    JOIN "Product" p ON p.id = wh."productId" AND p."archivedAt" IS NULL
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN bstock bs ON bs."productId" = wh."productId"
    LEFT JOIN bavg ba ON ba."productId" = wh."productId"
  `);

  return rows
    .map((r) => {
      const target = Math.ceil(r.dailyAvg * targetDays);
      const need = Math.max(0, target - r.branchStock);
      const suggest = Math.min(need, r.warehouseQty);
      return { ...r, target, need, suggest };
    })
    .filter((r) => r.suggest > 0)
    .sort((a, b) => b.suggest - a.suggest);
}
