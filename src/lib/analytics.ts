import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";

export const ANALYTICS_CACHE_TAG = "analytics";

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function diffDaysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export type DateRange = { start: Date; end: Date };

export type KPI = {
  totalSales: number;
  totalReceipts: number;
  totalVisits: number;
  avgReceipt: number;
  conversion: number; // %
  marja: number | null;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function makeKey(range: DateRange, branchId?: number, extra?: string): string[] {
  return [
    isoDay(range.start),
    isoDay(range.end),
    branchId ? String(branchId) : "all",
    ...(extra ? [extra] : []),
  ];
}

/**
 * SQL-based pro-rated CategorySales summa. Bitta query'da DB-side hisoblanadi.
 */
async function _sumCategorySalesProRated(
  range: DateRange,
  branchId?: number,
  categoryId?: number
): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: number | null }[]>`
    SELECT COALESCE(SUM(
      "amount"::numeric * (
        (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::numeric
        / NULLIF(("periodEnd" - "periodStart" + 1), 0)::numeric
      )
    ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodStart" <= ${range.end}::date
      AND "periodEnd"   >= ${range.start}::date
      ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
      ${categoryId ? Prisma.sql`AND "categoryId" = ${categoryId}` : Prisma.empty}  `;
  return Number(rows[0]?.total ?? 0);
}

export const sumCategorySalesProRated = (
  range: DateRange,
  branchId?: number,
  categoryId?: number
) =>
  unstable_cache(
    () => _sumCategorySalesProRated(range, branchId, categoryId),
    ["sumCategorySalesProRated", ...makeKey(range, branchId, categoryId ? `c${categoryId}` : undefined)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

/** Filiallar bo'yicha pro-rated savdo summasi — bitta query. */
async function _salesByBranch(range: DateRange): Promise<Map<number, number>> {
  const rows = await prisma.$queryRaw<{ branchId: number; total: number | null }[]>`
    SELECT "branchId", COALESCE(SUM(
      "amount"::numeric * (
        (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::numeric
        / NULLIF(("periodEnd" - "periodStart" + 1), 0)::numeric
      )
    ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodStart" <= ${range.end}::date
      AND "periodEnd"   >= ${range.start}::date    GROUP BY "branchId"
  `;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.branchId, Number(r.total ?? 0));
  return map;
}

/**
 * TOP-LEVEL kategoriya bo'yicha sotuv + marja (narxdan, vaznli) — bitta query.
 * Manba ProductSales (SKU → Product.categoryId = SUBKAT), subkat → top-level
 * kategoriyaga COALESCE(sub.parentId, sub.id) orqali yig'iladi. Har top-level uchun:
 *   fact  — ko'rsatiladigan savdo summasi (amount, haqiqiy savdo, proratsiyali)
 *   sales — marja maxraji: Σ(COALESCE(salePrice×soni, amount))  (narxdan, vaznli)
 *   cost  — marja surati: Σ(COALESCE(costPrice×soni, costAmount, 0)) (narxdan, vaznli)
 * marja = (sales − cost) / sales. fact KPI/grafik uchun, sales/cost faqat marja uchun.
 */
type CatMargin = { fact: number; sales: number; cost: number };
async function _priceMarginByCategory(
  range: DateRange,
  branchId?: number
): Promise<Map<number, CatMargin>> {
  const frac = Prisma.sql`(
    (LEAST(ps."periodEnd", ${range.end}::date) - GREATEST(ps."periodStart", ${range.start}::date) + 1)::numeric
    / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0)::numeric
  )`;
  const rows = await prisma.$queryRaw<{ categoryId: number; fact: number | null; sales: number | null; cost: number | null }[]>`
    SELECT COALESCE(sub."parentId", sub.id) AS "categoryId",
      COALESCE(SUM(ps."amount"::numeric * ${frac}), 0)::float8 AS fact,
      COALESCE(SUM(COALESCE(ps."salePrice" * ps."soldQty", ps."amount")::numeric * ${frac}), 0)::float8 AS sales,
      COALESCE(SUM(COALESCE(ps."costPrice" * ps."soldQty", ps."costAmount", 0)::numeric * ${frac}), 0)::float8 AS cost
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    JOIN "Category" sub ON sub.id = p."categoryId"
    WHERE ps."periodStart" <= ${range.end}::date
      AND ps."periodEnd"   >= ${range.start}::date
      ${branchId ? Prisma.sql`AND ps."branchId" = ${branchId}` : Prisma.empty}
    GROUP BY COALESCE(sub."parentId", sub.id)
  `;
  const map = new Map<number, CatMargin>();
  for (const r of rows) {
    map.set(r.categoryId, { fact: Number(r.fact ?? 0), sales: Number(r.sales ?? 0), cost: Number(r.cost ?? 0) });
  }
  return map;
}

/** Filial bo'yicha kunlik metrika summalari (1 query). */
// Chek metrikalari — QO'LDA kiritilgan DailyReceiptMetric'dan (sr.xlsx emas).
// O'rt. chek bu yerda hisoblanmaydi — chaqiruvchi sotuv÷chek bilan oladi.
async function _metricsByBranch(range: DateRange): Promise<
  Map<number, { receipts: number; avgItemsPerReceipt: number }>
> {
  const rows = await prisma.$queryRaw<
    { branchId: number; receipts: number; avgItems: number }[]
  >`
    SELECT "branchId",
      SUM("receiptCount")::int                                                     AS receipts,
      CASE WHEN SUM("receiptCount") > 0
        THEN SUM("itemsPerReceipt"::numeric * "receiptCount") / SUM("receiptCount")
        ELSE 0
      END::float8                                                                  AS "avgItems"
    FROM "DailyReceiptMetric"
    WHERE "date" >= ${range.start}::date AND "date" <= ${range.end}::date
    GROUP BY "branchId"
  `;
  const map = new Map<number, { receipts: number; avgItemsPerReceipt: number }>();
  for (const r of rows) {
    map.set(r.branchId, {
      receipts:           Number(r.receipts ?? 0),
      avgItemsPerReceipt: Number(r.avgItems ?? 0),
    });
  }
  return map;
}

/** Filial bo'yicha tashriflar summalari (1 query). */
async function _visitsByBranch(range: DateRange): Promise<Map<number, number>> {
  const rows = await prisma.dailyVisits.groupBy({
    by: ["branchId"],
    where: { date: { gte: range.start, lte: range.end } },
    _sum: { visitCount: true },
  });
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.branchId, r._sum.visitCount ?? 0);
  return map;
}

/**
 * KPI (umumiy yoki bitta filial uchun). Hamma so'rovlar parallel.
 */
async function _computeKPI(range: DateRange, branchId?: number): Promise<KPI> {
  const [totalSales, metricsAgg, visitsAgg, marginMap] = await Promise.all([
    _sumCategorySalesProRated(range, branchId),
    prisma.dailyReceiptMetric.aggregate({
      where: {
        date: { gte: range.start, lte: range.end },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { receiptCount: true },
    }),
    prisma.dailyVisits.aggregate({
      where: {
        date: { gte: range.start, lte: range.end },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { visitCount: true },
    }),
    _priceMarginByCategory(range, branchId),
  ]);

  const totalReceipts = metricsAgg._sum.receiptCount ?? 0;
  const totalVisits = visitsAgg._sum.visitCount ?? 0;
  // O'rt. chek = sotuv ÷ chek soni (SKU sotuv / qo'lda chek)
  const avgReceipt = totalReceipts > 0 ? totalSales / totalReceipts : 0;
  const conversion = totalVisits > 0 ? (totalReceipts / totalVisits) * 100 : 0;
  // Marja narxlardan (vaznli), kasrning IKKALA tomoni bir ProductSales bazasidan —
  // breakdown/hierarchy bilan izchil. totalSales (KPI) esa amount'da (haqiqiy savdo).
  let priceSales = 0, priceCost = 0;
  for (const v of marginMap.values()) { priceSales += v.sales; priceCost += v.cost; }
  const marja = priceSales > 0 ? ((priceSales - priceCost) / priceSales) * 100 : null;

  return { totalSales, totalReceipts, totalVisits, avgReceipt, conversion, marja };
}

export const computeKPI = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _computeKPI(range, branchId),
    ["computeKPI_v2", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export type DailyPoint = { date: string; value: number };

// Kunlik savdo = CategorySales (ProductSales rollup) kunlik proratsiyasi.
// Har kun uchun: ustma-ust davrlardan amount/(period kun soni) yig'indisi.
async function _dailySalesSeries(
  range: DateRange,
  branchId?: number,
  scope?: number[] | null // kategoriya menejeri qamrovi (subkat id'lari)
): Promise<DailyPoint[]> {
  const rows = await prisma.$queryRaw<{ date: string; value: number | null }[]>`
    SELECT g.s::date::text AS date,
      COALESCE(SUM(
        cs."amount"::numeric / NULLIF((cs."periodEnd" - cs."periodStart" + 1), 0)::numeric
      ), 0)::float8 AS value
    FROM generate_series(${range.start}::date, ${range.end}::date, '1 day'::interval) AS g(s)
    LEFT JOIN "CategorySales" cs
      ON cs."periodStart" <= g.s::date
      AND cs."periodEnd"   >= g.s::date
      ${branchId ? Prisma.sql`AND cs."branchId" = ${branchId}` : Prisma.empty}
      ${scope ? Prisma.sql`AND cs."categoryId" = ANY(${scope}::int[])` : Prisma.empty}
    GROUP BY g.s
    ORDER BY g.s
  `;
  return rows.map((r) => ({ date: r.date.slice(0, 10), value: Number(r.value ?? 0) }));
}

export const dailySalesSeries = (range: DateRange, branchId?: number, scope?: number[] | null) =>
  unstable_cache(
    () => _dailySalesSeries(range, branchId, scope),
    ["dailySalesSeries_v2", ...makeKey(range, branchId, scope ? `s${[...scope].sort((a, b) => a - b).join(",")}` : undefined)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

async function _dailyReceiptsSeries(
  range: DateRange,
  branchId?: number
): Promise<DailyPoint[]> {
  const rows = await prisma.dailyReceiptMetric.groupBy({
    by: ["date"],
    where: {
      date: { gte: range.start, lte: range.end },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { receiptCount: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    date: isoDay(r.date),
    value: Number(r._sum.receiptCount ?? 0),
  }));
}

export const dailyReceiptsSeries = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _dailyReceiptsSeries(range, branchId),
    ["dailyReceiptsSeries_v2", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

async function _dailyVisitsSeries(
  range: DateRange,
  branchId?: number
): Promise<DailyPoint[]> {
  const rows = await prisma.dailyVisits.groupBy({
    by: ["date"],
    where: {
      date: { gte: range.start, lte: range.end },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { visitCount: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    date: isoDay(r.date),
    value: Number(r._sum.visitCount ?? 0),
  }));
}

export const dailyVisitsSeries = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _dailyVisitsSeries(range, branchId),
    // _v2: eski stale kesh yozuvlari ishlatilmasin (boshqa funksiyalar kabi versiyalangan)
    ["dailyVisitsSeries_v2", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export type BranchShareRow = {
  branchId: number;
  branchName: string;
  sales: number;
  share: number;
};

async function _branchShare(range: DateRange): Promise<BranchShareRow[]> {
  const [branches, salesMap] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    _salesByBranch(range),
  ]);
  let total = 0;
  const rows: BranchShareRow[] = branches.map((b) => {
    const sales = salesMap.get(b.id) ?? 0;
    total += sales;
    return { branchId: b.id, branchName: b.name, sales, share: 0 };
  });
  for (const r of rows) r.share = total > 0 ? (r.sales / total) * 100 : 0;
  return rows;
}

export const branchShare = (range: DateRange) =>
  unstable_cache(
    () => _branchShare(range),
    ["branchShare", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export type CategoryRow = {
  categoryId: number;
  categoryName: string;
  fact: number;
  /** (sotuv - tannarx) / sotuv * 100. Tannarx ma'lumoti yo'q yoki sotuv 0 bo'lsa null. */
  marja: number | null;
};

async function _topCategories(
  range: DateRange,
  branchId?: number,
  limit = 18
): Promise<CategoryRow[]> {
  const [cats, marginMap] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
    _priceMarginByCategory(range, branchId),
  ]);
  const rows: CategoryRow[] = cats.map((c) => {
    const v = marginMap.get(c.id);
    const fact = v?.fact ?? 0; // ko'rsatiladigan savdo = amount (haqiqiy savdo)
    // marja narxlardan (vaznli), top-level kategoriyaga yig'ilgan
    const marja = v && v.sales > 0 ? ((v.sales - v.cost) / v.sales) * 100 : null;
    return {
      categoryId: c.id,
      categoryName: c.name,
      fact,
      marja,
    };
  });
  return rows.sort((a, b) => b.fact - a.fact).slice(0, limit);
}

export const topCategories = (range: DateRange, branchId?: number, limit = 10) =>
  unstable_cache(
    () => _topCategories(range, branchId, limit),
    ["topCategories", ...makeKey(range, branchId, `l${limit}`)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export type BranchPerformanceRow = {
  branchId: number;
  branchName: string;
  sales: number;
  receipts: number;
  visits: number;
  conversion: number;
  avgReceipt: number;
};

async function _branchPerformance(range: DateRange): Promise<BranchPerformanceRow[]> {
  const [branches, salesMap, metricsMap, visitsMap] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    _salesByBranch(range),
    _metricsByBranch(range),
    _visitsByBranch(range),
  ]);
  return branches.map((b) => {
    const sales = salesMap.get(b.id) ?? 0;
    const m = metricsMap.get(b.id) ?? { receipts: 0, avgItemsPerReceipt: 0 };
    const visits = visitsMap.get(b.id) ?? 0;
    // O'rt. chek = SKU sotuv ÷ chek soni (qo'lda DailyReceiptMetric)
    const avgReceipt = m.receipts > 0 ? sales / m.receipts : 0;
    const conversion = visits > 0 ? (m.receipts / visits) * 100 : 0;
    return {
      branchId: b.id,
      branchName: b.name,
      sales,
      receipts: m.receipts,
      visits,
      conversion,
      avgReceipt,
    };
  });
}

export const branchPerformance = (range: DateRange) =>
  unstable_cache(
    () => _branchPerformance(range),
    ["branchPerformance_v2", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

/**
 * Filial × TOP-LEVEL kategoriya bo'yicha sotuv + marja (narxdan, vaznli) — bitta query.
 * ProductSales (subkat → Product.categoryId) → top-level COALESCE(sub.parentId, sub.id).
 * Har (filial, top-level) uchun: fact (amount, haqiqiy savdo), sales/cost (narxdan, marja uchun).
 */
async function _priceMarginByBranchCategory(
  range: DateRange
): Promise<Map<number, Map<number, CatMargin>>> {
  const frac = Prisma.sql`(
    (LEAST(ps."periodEnd", ${range.end}::date) - GREATEST(ps."periodStart", ${range.start}::date) + 1)::numeric
    / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0)::numeric
  )`;
  const rows = await prisma.$queryRaw<
    { branchId: number; categoryId: number; fact: number | null; sales: number | null; cost: number | null }[]
  >`
    SELECT ps."branchId" AS "branchId", COALESCE(sub."parentId", sub.id) AS "categoryId",
      COALESCE(SUM(ps."amount"::numeric * ${frac}), 0)::float8 AS fact,
      COALESCE(SUM(COALESCE(ps."salePrice" * ps."soldQty", ps."amount")::numeric * ${frac}), 0)::float8 AS sales,
      COALESCE(SUM(COALESCE(ps."costPrice" * ps."soldQty", ps."costAmount", 0)::numeric * ${frac}), 0)::float8 AS cost
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    JOIN "Category" sub ON sub.id = p."categoryId"
    WHERE ps."periodStart" <= ${range.end}::date
      AND ps."periodEnd"   >= ${range.start}::date
    GROUP BY ps."branchId", COALESCE(sub."parentId", sub.id)
  `;
  const map = new Map<number, Map<number, CatMargin>>();
  for (const r of rows) {
    if (!map.has(r.branchId)) map.set(r.branchId, new Map());
    map.get(r.branchId)!.set(r.categoryId, { fact: Number(r.fact ?? 0), sales: Number(r.sales ?? 0), cost: Number(r.cost ?? 0) });
  }
  return map;
}

export type CategoryBreakdown = {
  categoryId: number;
  categoryName: string;
  sales: number;
  /** Marja maxraji (narxdan, vaznli: Σ COALESCE(salePrice×soni, amount)). Jami marjani
   *  to'g'ri (simmetrik) hisoblash uchun — `sales` (amount) bilan adashtirmang. */
  saleBase: number;
  cost: number;
  hasCost: boolean;
  marja: number | null;
};

export type BranchReportRow = {
  branchId: number;
  branchName: string;
  /** Sotuv = ProductSales amount jami (pro-rated, haqiqiy savdo). */
  sales: number;
  /** Marja maxraji (narxdan: Σ COALESCE(salePrice×soni, amount)) — jami marja uchun. */
  saleBase: number;
  /** Tannarx — narxdan (vaznli: Σ COALESCE(costPrice×soni, costAmount, 0)). */
  cost: number;
  hasCost: boolean;
  /** Marja = (saleBase − cost) / saleBase * 100 (narxlardan, vaznli). */
  marja: number | null;
  receipts: number;
  avgReceipt: number;
  avgItemsPerReceipt: number;
  visits: number;
  conversion: number;
  categories: CategoryBreakdown[];
};

async function _branchReport(range: DateRange): Promise<BranchReportRow[]> {
  const [branches, allCategories, marginBCMap, metricsMap, visitsMap] =
    await Promise.all([
      prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
      _priceMarginByBranchCategory(range),
      _metricsByBranch(range),
      _visitsByBranch(range),
    ]);

  return branches.map((b) => {
    const catMap = marginBCMap.get(b.id) ?? new Map<number, CatMargin>();

    // Filial jami: sotuv = amount (haqiqiy savdo), marja = narxdan (priceSales/priceCost).
    let salesAmount = 0, priceSales = 0, cost = 0;
    for (const v of catMap.values()) { salesAmount += v.fact; priceSales += v.sales; cost += v.cost; }

    const hasCost = cost > 0;
    const marja   = priceSales > 0 ? ((priceSales - cost) / priceSales) * 100 : null;

    const m      = metricsMap.get(b.id) ?? { receipts: 0, avgItemsPerReceipt: 0 };
    const visits = visitsMap.get(b.id) ?? 0;

    const categories: CategoryBreakdown[] = allCategories.map((c) => {
      const v = catMap.get(c.id);
      const cFact  = v?.fact ?? 0;
      const cCost  = v?.cost ?? 0;
      return {
        categoryId:   c.id,
        categoryName: c.name,
        sales:   cFact, // ko'rsatiladigan savdo = amount
        saleBase: v?.sales ?? 0, // marja maxraji (narxdan)
        cost:    cCost,
        hasCost: cCost > 0,
        marja:   v && v.sales > 0 ? ((v.sales - v.cost) / v.sales) * 100 : null,
      };
    });

    return {
      branchId:           b.id,
      branchName:         b.name,
      sales:              salesAmount,           // ProductSales amount jami (haqiqiy savdo)
      saleBase:           priceSales,            // marja maxraji (narxdan)
      cost,
      hasCost,
      marja,
      receipts:           m.receipts,
      avgReceipt:         m.receipts > 0 ? salesAmount / m.receipts : 0,
      avgItemsPerReceipt: m.avgItemsPerReceipt,
      visits,
      conversion:         visits > 0 ? (m.receipts / visits) * 100 : 0,
      categories,
    };
  });
}

export const branchReport = (range: DateRange) =>
  unstable_cache(
    () => _branchReport(range),
    ["branchReport_v2", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export type MissingDays = {
  sales: string[];   // ISO YYYY-MM-DD — CategorySales yo'q yoki barchasi 0
  visits: string[];  // ISO YYYY-MM-DD — DailyVisits yo'q yoki barchasi 0
};

async function _findMissingDays(range: DateRange): Promise<MissingDays> {
  // Sanalar ::text bilan olinadi — DATE ustunini JS Date'ga aylantirishda driver/TZ
  // farqi kun siljitishi mumkin ("Fakt=0" bug'i shu sinfdan edi). String aniq.
  const [salesRows, visitsRows] = await Promise.all([
    prisma.$queryRaw<{ ps: string; pe: string }[]>`
      SELECT DISTINCT "periodStart"::text AS ps, "periodEnd"::text AS pe
      FROM "CategorySales"
      WHERE "periodEnd" >= ${range.start} AND "periodStart" <= ${range.end}
        AND amount > 0
    `,
    prisma.$queryRaw<{ d: string }[]>`
      SELECT DISTINCT date::text AS d
      FROM "DailyVisits"
      WHERE date BETWEEN ${range.start} AND ${range.end}
        AND "visitCount" > 0
    `,
  ]);

  const haveSales = new Set<string>();
  const dayMs = 86_400_000;
  for (const r of salesRows) {
    const s = Math.max(Date.parse(r.ps + "T00:00:00.000Z"), range.start.getTime());
    const e = Math.min(Date.parse(r.pe + "T00:00:00.000Z"), range.end.getTime());
    for (let t = s; t <= e; t += dayMs) haveSales.add(isoDay(new Date(t)));
  }
  const haveVisits = new Set(visitsRows.map((r) => r.d));

  const missingSales: string[] = [];
  const missingVisits: string[] = [];
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += dayMs) {
    const iso = isoDay(new Date(t));
    if (!haveSales.has(iso))  missingSales.push(iso);
    if (!haveVisits.has(iso)) missingVisits.push(iso);
  }
  return { sales: missingSales, visits: missingVisits };
}

export const findMissingDays = (range: DateRange) =>
  unstable_cache(
    () => _findMissingDays(range),
    ["missingDays", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

/** Mavjud ma'lumot davri (default range hisoblash uchun). */
// unstable_cache Date serialize qila olmaydi — ISO string sifatida cache qilamiz.
const _cachedDefaultRange = unstable_cache(
  async (): Promise<{ start: string; end: string }> => {
    const [lastSale, lastVisit] = await Promise.all([
      prisma.categorySales.findFirst({ orderBy: { periodEnd: "desc" }, select: { periodEnd: true } }),
      prisma.dailyVisits.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    ]);
    const candidates = [lastSale?.periodEnd, lastVisit?.date].filter(Boolean) as Date[];
    if (candidates.length === 0) {
      const now = new Date();
      return { start: isoDay(startOfMonth(now)), end: isoDay(endOfMonth(now)) };
    }
    const ref = new Date(Math.max(...candidates.map((d) => d.getTime())));
    return { start: isoDay(startOfMonth(ref)), end: isoDay(endOfMonth(ref)) };
  },
  ["defaultRange"],
  { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
);

export async function getDefaultRange(): Promise<DateRange> {
  const { start, end } = await _cachedDefaultRange();
  return {
    start: new Date(start + "T00:00:00.000Z"),
    end:   new Date(end   + "T00:00:00.000Z"),
  };
}
