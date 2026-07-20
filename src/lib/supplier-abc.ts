/**
 * Postavshik (Supplier) darajasidagi ABC tahlili.
 *
 * MEZON: har bir postavshikning JAMI SAVDO TUSHUMIDAGI ULUSHI (%). Ya'ni o'sha
 * postavshikning SKU'lari qancha savdo qilgan / umumiy savdo. Metrika —
 * `ProductSales.amount` (savdo tushumi). Marja EMAS, sotib olish summasi EMAS.
 *
 * ABC: kumulyativ ulush bo'yicha klassik Pareto — A ≤ 80%, B ≤ 95%, C qolgani.
 * Postavshiklar soni ~300 atrofida bo'lgani uchun A guruhga oz sonli (10-20 ta)
 * postavshik tushishi NORMAL — bu tahlilning maqsadi, xato emas.
 *
 * Hisob uchib (on-the-fly) bajariladi va keshlanadi — DB'da denormalizatsiya
 * ustuni yo'q, migratsiya talab qilmaydi.
 *
 * Tasniflash mantiqi `abc-xyz.ts` dagi umumiy `classifyAbcXyz` yadrosidan olinadi —
 * Pareto/CV formulasi bitta joyda.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import {
  classifyAbcXyz,
  abcDefaultStart,
  ABC_A_LIMIT,
  ABC_B_LIMIT,
  type AbcClass,
  type XyzClass,
  type AbcXyzLimits,
} from "@/lib/abc-xyz";

export type { AbcClass, XyzClass };
// Default oyna (oxirgi ~3 oy) SKU tahlili bilan bir manba — sahifalar mos davr ko'rsatsin.
export { abcDefaultStart };

// ─── Chegaralar ────────────────────────────────────────────────────────────────

// ABC — klassik Pareto 80/95. Qiymati SKU chegaralari bilan bir xil, lekin ALOHIDA
// eksport: postavshik siyosati kelajakda mustaqil sozlanishi mumkin.
export const SUPPLIER_ABC_A_LIMIT = ABC_A_LIMIT;
export const SUPPLIER_ABC_B_LIMIT = ABC_B_LIMIT;

// XYZ — postavshik darajasida savdo o'nlab/yuzlab SKU bo'yicha yig'ilgani uchun
// tasodifiy tebranishlar bir-birini so'ndiradi va CV tabiiy ravishda SKU'nikidan
// ancha past chiqadi. Shuning uchun SKU chegaralari (0.25/0.5) EMAS, klassik
// 0.10/0.25 ishlatiladi — aks holda deyarli barcha postavshik "X" bo'lib qolardi.
export const SUPPLIER_XYZ_X_LIMIT = 0.1;
export const SUPPLIER_XYZ_Y_LIMIT = 0.25;

export const SUPPLIER_ABC_XYZ_LIMITS: AbcXyzLimits = {
  abcA: SUPPLIER_ABC_A_LIMIT,
  abcB: SUPPLIER_ABC_B_LIMIT,
  xyzX: SUPPLIER_XYZ_X_LIMIT,
  xyzY: SUPPLIER_XYZ_Y_LIMIT,
};

// ─── Tiplar ────────────────────────────────────────────────────────────────────

export type SupplierAbcRow = {
  supplierId: number;
  name: string;      // postavshik nomi (UI ikkinchi so'rov qilmasin uchun)
  total: number;     // davr bo'yicha savdo summasi (so'm)
  qty: number;       // sotilgan dona
  skuCount: number;  // davrda savdosi bo'lgan SKU soni
  share: number;     // jami savdoga ulush (0..1) — foizga: share * 100
  cumShare: number;  // kumulyativ ulush (0..1, savdo bo'yicha kamayish tartibida)
  cv: number;        // variatsiya koeffitsiyenti (davrlar kesimida)
  abc: AbcClass;
  xyz: XyzClass;     // ixtiyoriy ko'rsatkich — asosiysi ABC
};

export type SupplierAbcResult = {
  rows: SupplierAbcRow[]; // savdo bo'yicha kamayish tartibida
  nPeriods: number;       // oraliqdagi DISTINCT yuklash davrlari soni
  totalAmount: number;    // BARCHA postavshikli savdo summasi (ulush maxraji)
};

type RawRow = {
  sid: number;
  name: string;
  total: number;
  sumsq: number;
  qty: number;
  skuCount: number;
};

// ─── Hisob ─────────────────────────────────────────────────────────────────────

async function _computeSupplierAbc(
  startStr: string,
  endStr: string,
  branchId?: number
): Promise<SupplierAbcResult> {
  const branchCond = branchId ? Prisma.sql`AND ps."branchId" = ${branchId}` : Prisma.empty;

  const [periodRes, raw] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT ps."periodStart")::int AS n
      FROM "ProductSales" ps
      WHERE ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date ${branchCond}
    `),
    prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH base AS MATERIALIZED (
        -- Yagona og'ir skan: postavshik × davr × SKU (filiallar yig'ilgan).
        -- MATERIALIZED — "per" va "skus" shu natijadan o'qisin, ProductSales
        -- IKKI MARTA skanerlanmasin (prod'da bu jadval millionlab qator).
        SELECT p."supplierId" AS sid, ps."periodStart" AS pstart, ps."productId" AS pid,
               COALESCE(SUM(ps.amount), 0)::float8    AS s,
               COALESCE(SUM(ps."soldQty"), 0)::float8 AS q
        FROM "ProductSales" ps
        JOIN "Product" p ON p.id = ps."productId"
        WHERE p."supplierId" IS NOT NULL
          AND ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date ${branchCond}
        GROUP BY 1, 2, 3
      ),
      per AS (
        -- har postavshik × davr: BARCHA SKU'lari bo'yicha yig'ilgan savdo.
        -- Davr darajasida yig'ish XYZ uchun shart: CV davrlararo tebranishni o'lchaydi.
        SELECT sid, pstart, SUM(s) AS s, SUM(q) AS q
        FROM base GROUP BY 1, 2
      ),
      skus AS (
        -- davrda savdosi bo'lgan SKU soni (profil kartochkasi uchun ma'lumot)
        SELECT sid, COUNT(DISTINCT pid)::int AS "skuCount"
        FROM base WHERE s > 0 GROUP BY 1
      ),
      agg AS (
        SELECT sid, SUM(s) AS total, SUM(s * s) AS sumsq, SUM(q) AS qty
        FROM per GROUP BY sid
        HAVING SUM(s) > 0 -- savdosiz postavshik ulush maxrajini buzmasin (0/0)
      )
      SELECT a.sid, s.name,
             a.total::float8 AS total, a.sumsq::float8 AS sumsq, a.qty::float8 AS qty,
             COALESCE(k."skuCount", 0) AS "skuCount"
      FROM agg a
      JOIN "Supplier" s ON s.id = a.sid
      LEFT JOIN skus k ON k.sid = a.sid
      ORDER BY a.total DESC, a.sid
    `),
  ]);

  const nPeriods = periodRes[0]?.n ?? 0;
  const { totalAmount, classes } = classifyAbcXyz(raw, nPeriods, SUPPLIER_ABC_XYZ_LIMITS);

  const rows: SupplierAbcRow[] = raw.map((r, i) => {
    const c = classes[i];
    return {
      supplierId: r.sid,
      name: r.name,
      total: r.total,
      qty: r.qty,
      skuCount: r.skuCount,
      share: c.share,
      cumShare: c.cum,
      cv: c.cv,
      abc: c.abc,
      xyz: c.xyz,
    };
  });

  return { rows, nPeriods, totalAmount };
}

/**
 * Postavshiklar ABC tahlili — keshlanadi (tag: "analytics", sotuv yuklanganda
 * invalidatsiya bo'ladi). `startStr`/`endStr` — "YYYY-MM-DD" (isoDay).
 */
export function computeSupplierAbc(
  startStr: string,
  endStr: string,
  branchId?: number
): Promise<SupplierAbcResult> {
  return unstable_cache(
    () => _computeSupplierAbc(startStr, endStr, branchId),
    ["supplierAbc_v1", startStr, endStr, branchId ? String(branchId) : "all"],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();
}

// ─── Yordamchilar (UI uchun) ───────────────────────────────────────────────────

/** supplierId → qator: postavshiklar ro'yxatiga sinfni biriktirish uchun. */
export function supplierAbcMap(result: SupplierAbcResult): Map<number, SupplierAbcRow> {
  return new Map(result.rows.map((r) => [r.supplierId, r]));
}

export type SupplierAbcSummary = { abc: AbcClass; count: number; total: number; share: number };

/** A/B/C bo'yicha jamlanma — "A: 14 ta postavshik = 80% savdo" kabi KPI uchun. */
export function supplierAbcSummary(result: SupplierAbcResult): SupplierAbcSummary[] {
  return (["A", "B", "C"] as const).map((abc) => {
    const inClass = result.rows.filter((r) => r.abc === abc);
    const total = inClass.reduce((s, r) => s + r.total, 0);
    return {
      abc,
      count: inClass.length,
      total,
      share: result.totalAmount > 0 ? total / result.totalAmount : 0,
    };
  });
}
