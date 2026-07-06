/**
 * Filiallararo ko'chirish tavsiyasi — manba filialdagi ortiqcha/o'lik qoldiqni
 * qabul qiluvchi filialga ko'chirish (markaziy ombordan o'tmasdan).
 *   manba ortiqcha = max(0, manba qoldiq − ceil(manba kunlik × kun))   // o'ziga kerakini saqlaydi
 *   ehtiyoj        = max(0, ceil(qabul kunlik × kun) − qabul qoldiq)
 *   tavsiya        = min(ortiqcha, ehtiyoj)
 * Qoldiq/sotuv — ProductSales (oxirgi snapshot + davr o'rtachasi). Manbada qoldiq bor SKU'lar.
 */
import { prisma } from "@/lib/prisma";
import { isoDay } from "@/lib/date";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";

export type TransferSuggest = {
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  sourceStock: number;
  sourceDaily: number;
  sourceSurplus: number;
  targetStock: number;
  targetDaily: number;
  need: number;
  suggest: number;
};

type RawRow = {
  productId: number; code: number; name: string; sub: string | null;
  sourceStock: number; sourceDaily: number; targetStock: number; targetDaily: number;
};

/** Manba → qabul qiluvchi filial uchun ko'chirish tavsiyasi — tavsiya > 0 bo'lgan SKU'lar. */
export async function branchTransferSuggest(
  fromBranchId: number, toBranchId: number, targetDays: number
): Promise<TransferSuggest[]> {
  if (fromBranchId === toBranchId) return [];
  const range = await getDefaultRange();
  const startStr = isoDay(range.start);
  const endStr = isoDay(range.end);

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH src_stock AS (
      SELECT DISTINCT ON (ps."productId") ps."productId", ps."stockQty"::float8 AS stock
      FROM "ProductSales" ps
      WHERE ps."branchId" = ${fromBranchId}
      ORDER BY ps."productId", ps."periodEnd" DESC
    ),
    src_avg AS (
      SELECT ps."productId",
             (COALESCE(SUM(ps."soldQty"), 0) / NULLIF(COUNT(DISTINCT ps."periodStart"), 0))::float8 AS daily
      FROM "ProductSales" ps
      WHERE ps."branchId" = ${fromBranchId}
        AND ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date
      GROUP BY ps."productId"
    ),
    dst_stock AS (
      SELECT DISTINCT ON (ps."productId") ps."productId", ps."stockQty"::float8 AS stock
      FROM "ProductSales" ps
      WHERE ps."branchId" = ${toBranchId}
      ORDER BY ps."productId", ps."periodEnd" DESC
    ),
    dst_avg AS (
      SELECT ps."productId",
             (COALESCE(SUM(ps."soldQty"), 0) / NULLIF(COUNT(DISTINCT ps."periodStart"), 0))::float8 AS daily
      FROM "ProductSales" ps
      WHERE ps."branchId" = ${toBranchId}
        AND ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date
      GROUP BY ps."productId"
    )
    SELECT ss."productId" AS "productId", p.code, p.name, c.name AS sub,
           ss.stock AS "sourceStock",
           COALESCE(sa.daily, 0) AS "sourceDaily",
           COALESCE(ds.stock, 0) AS "targetStock",
           COALESCE(da.daily, 0) AS "targetDaily"
    FROM src_stock ss
    JOIN "Product" p ON p.id = ss."productId" AND p."archivedAt" IS NULL
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN src_avg sa ON sa."productId" = ss."productId"
    LEFT JOIN dst_stock ds ON ds."productId" = ss."productId"
    LEFT JOIN dst_avg da ON da."productId" = ss."productId"
    WHERE ss.stock > 0
  `);

  return rows
    .map((r) => {
      const sourceSurplus = Math.max(0, r.sourceStock - Math.ceil(r.sourceDaily * targetDays));
      const need = Math.max(0, Math.ceil(r.targetDaily * targetDays) - r.targetStock);
      const suggest = Math.min(sourceSurplus, need);
      return { ...r, sourceSurplus, need, suggest };
    })
    .filter((r) => r.suggest > 0)
    .sort((a, b) => b.suggest - a.suggest);
}
