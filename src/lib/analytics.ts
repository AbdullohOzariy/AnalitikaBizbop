import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";

export const ANALYTICS_CACHE_TAG = "analytics";

/**
 * Faqat ko'rinadigan kategoriyalar (sortOrder > 0) hisoblanadi.
 * "Jami sotuv = ko'rinadigan kategoriyalar yig'indisi" qoidasi.
 */
const VISIBLE_CAT_FILTER = Prisma.sql`
  AND EXISTS (
    SELECT 1 FROM "Category" "_c"
    WHERE "_c"."id" = "CategorySales"."categoryId" AND "_c"."sortOrder" > 0
  )
`;

/**
 * UTC kun boshi sifatida Date qaytaradi.
 */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function diffDaysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function overlapDays(
  rangeStart: Date,
  rangeEnd: Date,
  pStart: Date,
  pEnd: Date
): number {
  const s = Math.max(rangeStart.getTime(), pStart.getTime());
  const e = Math.min(rangeEnd.getTime(), pEnd.getTime());
  if (e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
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
      ${categoryId ? Prisma.sql`AND "categoryId" = ${categoryId}` : Prisma.empty}
      ${VISIBLE_CAT_FILTER}
  `;
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
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
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
      AND "periodEnd"   >= ${range.start}::date
      ${VISIBLE_CAT_FILTER}
    GROUP BY "branchId"
  `;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.branchId, Number(r.total ?? 0));
  return map;
}

/** Kategoriya bo'yicha pro-rated savdo — bitta query. */
async function _salesByCategory(
  range: DateRange,
  branchId?: number
): Promise<Map<number, number>> {
  const rows = await prisma.$queryRaw<{ categoryId: number; total: number | null }[]>`
    SELECT "categoryId", COALESCE(SUM(
      "amount"::numeric * (
        (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::numeric
        / NULLIF(("periodEnd" - "periodStart" + 1), 0)::numeric
      )
    ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodStart" <= ${range.end}::date
      AND "periodEnd"   >= ${range.start}::date
      ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
      ${VISIBLE_CAT_FILTER}
    GROUP BY "categoryId"
  `;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.categoryId, Number(r.total ?? 0));
  return map;
}

/** Tannarx: kategoriya bo'yicha (costAmount mavjud qatorlar uchun). */
async function _costByCategory(
  range: DateRange,
  branchId?: number
): Promise<Map<number, number>> {
  const rows = await prisma.$queryRaw<{ categoryId: number; total: number | null }[]>`
    SELECT "categoryId", COALESCE(SUM(
      "costAmount"::numeric * (
        (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::numeric
        / NULLIF(("periodEnd" - "periodStart" + 1), 0)::numeric
      )
    ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodStart" <= ${range.end}::date
      AND "periodEnd"   >= ${range.start}::date
      AND "costAmount"  IS NOT NULL
      ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
      ${VISIBLE_CAT_FILTER}
    GROUP BY "categoryId"
  `;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.categoryId, Number(r.total ?? 0));
  return map;
}

/** Filial bo'yicha kunlik metrika summalari (1 query). */
async function _metricsByBranch(range: DateRange): Promise<
  Map<number, { receipts: number; receiptTotal: number; avgItemsPerReceipt: number }>
> {
  const rows = await prisma.$queryRaw<
    { branchId: number; receipts: number; receiptTotal: number; avgItems: number }[]
  >`
    SELECT "branchId",
      SUM("receiptCount")::int                                                     AS receipts,
      SUM("receiptTotal"::numeric)::float8                                         AS "receiptTotal",
      CASE WHEN SUM("receiptCount") > 0
        THEN SUM("avgItemsPerReceipt"::numeric * "receiptCount") / SUM("receiptCount")
        ELSE 0
      END::float8                                                                  AS "avgItems"
    FROM "DailyMetrics"
    WHERE "date" >= ${range.start}::date AND "date" <= ${range.end}::date
    GROUP BY "branchId"
  `;
  const map = new Map<number, { receipts: number; receiptTotal: number; avgItemsPerReceipt: number }>();
  for (const r of rows) {
    map.set(r.branchId, {
      receipts:           Number(r.receipts ?? 0),
      receiptTotal:       Number(r.receiptTotal ?? 0),
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
  const [totalSales, metricsAgg, visitsAgg, costMap] = await Promise.all([
    _sumCategorySalesProRated(range, branchId),
    prisma.dailyMetrics.aggregate({
      where: {
        date: { gte: range.start, lte: range.end },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { receiptCount: true, receiptTotal: true },
    }),
    prisma.dailyVisits.aggregate({
      where: {
        date: { gte: range.start, lte: range.end },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { visitCount: true },
    }),
    _costByCategory(range, branchId),
  ]);

  const totalReceipts = metricsAgg._sum.receiptCount ?? 0;
  const totalReceiptSum = Number(metricsAgg._sum.receiptTotal ?? 0);
  const totalVisits = visitsAgg._sum.visitCount ?? 0;
  const avgReceipt = totalReceipts > 0 ? totalReceiptSum / totalReceipts : 0;
  const conversion = totalVisits > 0 ? (totalReceipts / totalVisits) * 100 : 0;
  const totalCost = [...costMap.values()].reduce((a, b) => a + b, 0);
  const marja = totalSales > 0 ? ((totalSales - totalCost) / totalSales) * 100 : null;

  return { totalSales, totalReceipts, totalVisits, avgReceipt, conversion, marja };
}

export const computeKPI = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _computeKPI(range, branchId),
    ["computeKPI", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

export type DailyPoint = { date: string; value: number };

async function _dailySalesSeries(
  range: DateRange,
  branchId?: number
): Promise<DailyPoint[]> {
  const rows = await prisma.dailyMetrics.groupBy({
    by: ["date"],
    where: {
      date: { gte: range.start, lte: range.end },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { receiptTotal: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({
    date: isoDay(r.date),
    value: Number(r._sum.receiptTotal ?? 0),
  }));
}

export const dailySalesSeries = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _dailySalesSeries(range, branchId),
    ["dailySalesSeries", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

async function _dailyReceiptsSeries(
  range: DateRange,
  branchId?: number
): Promise<DailyPoint[]> {
  const rows = await prisma.dailyMetrics.groupBy({
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
    ["dailyReceiptsSeries", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
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
    ["dailyVisitsSeries", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
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
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

export type CategoryRow = {
  categoryId: number;
  categoryName: string;
  fact: number;
  /** (sotuv - tannarx) / tannarx * 100. Tannarx ma'lumoti yo'q bo'lsa null. */
  marja: number | null;
};

async function _topCategories(
  range: DateRange,
  branchId?: number,
  limit = 18
): Promise<CategoryRow[]> {
  const [cats, factMap, costMap] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
    _salesByCategory(range, branchId),
    _costByCategory(range, branchId),
  ]);
  const rows: CategoryRow[] = cats.map((c) => {
    const fact = factMap.get(c.id) ?? 0;
    const cost = costMap.get(c.id);
    const marja =
      cost != null && fact > 0 ? ((fact - cost) / fact) * 100 : null;
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
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
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
    const m = metricsMap.get(b.id) ?? { receipts: 0, receiptTotal: 0 };
    const visits = visitsMap.get(b.id) ?? 0;
    // To'g'ri formula: DailyMetrics.receiptTotal / receiptCount (_branchReport bilan izchil).
    // Avvalgi `sales / m.receipts` xato edi — CategorySales summasini POS chek soniga bo'lardi.
    const avgReceipt = m.receipts > 0 ? m.receiptTotal / m.receipts : 0;
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
    ["branchPerformance", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

/** Filial × kategoriya bo'yicha pro-rated sotuv (2D map). */
async function _salesByBranchCategory(
  range: DateRange
): Promise<Map<number, Map<number, number>>> {
  const rows = await prisma.$queryRaw<
    { branchId: number; categoryId: number; total: number | null }[]
  >`
    SELECT "branchId", "categoryId", COALESCE(SUM(
      "amount"::numeric * (
        (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::numeric
        / NULLIF(("periodEnd" - "periodStart" + 1), 0)::numeric
      )
    ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodStart" <= ${range.end}::date
      AND "periodEnd"   >= ${range.start}::date
      ${VISIBLE_CAT_FILTER}
    GROUP BY "branchId", "categoryId"
  `;
  const map = new Map<number, Map<number, number>>();
  for (const r of rows) {
    if (!map.has(r.branchId)) map.set(r.branchId, new Map());
    map.get(r.branchId)!.set(r.categoryId, Number(r.total ?? 0));
  }
  return map;
}

/** Filial × kategoriya bo'yicha pro-rated tannarx (2D map). */
async function _costByBranchCategory(
  range: DateRange
): Promise<Map<number, Map<number, number>>> {
  const rows = await prisma.$queryRaw<
    { branchId: number; categoryId: number; total: number | null }[]
  >`
    SELECT "branchId", "categoryId", COALESCE(SUM(
      "costAmount"::numeric * (
        (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::numeric
        / NULLIF(("periodEnd" - "periodStart" + 1), 0)::numeric
      )
    ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodStart" <= ${range.end}::date
      AND "periodEnd"   >= ${range.start}::date
      AND "costAmount"  IS NOT NULL
      ${VISIBLE_CAT_FILTER}
    GROUP BY "branchId", "categoryId"
  `;
  const map = new Map<number, Map<number, number>>();
  for (const r of rows) {
    if (!map.has(r.branchId)) map.set(r.branchId, new Map());
    map.get(r.branchId)!.set(r.categoryId, Number(r.total ?? 0));
  }
  return map;
}

export type CategoryBreakdown = {
  categoryId: number;
  categoryName: string;
  sales: number;
  cost: number;
  hasCost: boolean;
  marja: number | null;
};

export type BranchReportRow = {
  branchId: number;
  branchName: string;
  /** Sotuv = SUM(receiptTotal) DailyMetrics dan (POS kassa). */
  sales: number;
  /** Tannarx — CategorySales.costAmount dan. */
  cost: number;
  hasCost: boolean;
  /** Marja = (categorySales - cost) / cost * 100 (CategorySales asosida). */
  marja: number | null;
  receipts: number;
  avgReceipt: number;
  avgItemsPerReceipt: number;
  visits: number;
  conversion: number;
  categories: CategoryBreakdown[];
};

async function _branchReport(range: DateRange): Promise<BranchReportRow[]> {
  const [branches, allCategories, salesBCMap, costBCMap, metricsMap, visitsMap] =
    await Promise.all([
      prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.category.findMany({ where: { parentId: null, sortOrder: { gt: 0 } }, orderBy: { sortOrder: "asc" } }),
      _salesByBranchCategory(range),
      _costByBranchCategory(range),
      _metricsByBranch(range),
      _visitsByBranch(range),
    ]);

  return branches.map((b) => {
    const catSalesMap = salesBCMap.get(b.id) ?? new Map<number, number>();
    const catCostMap  = costBCMap.get(b.id)  ?? new Map<number, number>();

    // CategorySales aggregates (for marja)
    let categorySales = 0, cost = 0;
    for (const v of catSalesMap.values()) categorySales += v;
    for (const v of catCostMap.values())  cost          += v;

    const hasCost = cost > 0;
    const marja   = hasCost && categorySales > 0 ? ((categorySales - cost) / categorySales) * 100 : null;

    const m      = metricsMap.get(b.id) ?? { receipts: 0, receiptTotal: 0, avgItemsPerReceipt: 0 };
    const visits = visitsMap.get(b.id) ?? 0;

    const categories: CategoryBreakdown[] = allCategories.map((c) => {
      const cSales   = catSalesMap.get(c.id) ?? 0;
      const cCost    = catCostMap.get(c.id)  ?? 0;
      const cHasCost = cCost > 0;
      return {
        categoryId:   c.id,
        categoryName: c.name,
        sales:   cSales,
        cost:    cCost,
        hasCost: cHasCost,
        marja:   cHasCost && cSales > 0 ? ((cSales - cCost) / cSales) * 100 : null,
      };
    });

    return {
      branchId:           b.id,
      branchName:         b.name,
      sales:              categorySales,         // CategorySales jami (barcha kategoriyalar)
      cost,
      hasCost,
      marja,
      receipts:           m.receipts,
      avgReceipt:         m.receipts > 0 ? m.receiptTotal / m.receipts : 0,
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
    ["branchReport", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

export type MissingDays = {
  sales: string[];   // ISO YYYY-MM-DD — DailyMetrics yo'q yoki barchasi 0
  visits: string[];  // ISO YYYY-MM-DD — DailyVisits yo'q yoki barchasi 0
};

async function _findMissingDays(range: DateRange): Promise<MissingDays> {
  const [salesRows, visitsRows] = await Promise.all([
    prisma.$queryRaw<{ "periodStart": Date; "periodEnd": Date }[]>`
      SELECT DISTINCT "periodStart", "periodEnd"
      FROM "CategorySales"
      WHERE "periodEnd" >= ${range.start} AND "periodStart" <= ${range.end}
        AND amount > 0
    `,
    prisma.$queryRaw<{ d: Date }[]>`
      SELECT DISTINCT date AS d
      FROM "DailyVisits"
      WHERE date BETWEEN ${range.start} AND ${range.end}
        AND "visitCount" > 0
    `,
  ]);

  const haveSales = new Set<string>();
  const dayMs = 86_400_000;
  for (const r of salesRows) {
    const s = Math.max(r.periodStart.getTime(), range.start.getTime());
    const e = Math.min(r.periodEnd.getTime(),   range.end.getTime());
    for (let t = s; t <= e; t += dayMs) haveSales.add(isoDay(new Date(t)));
  }
  const haveVisits = new Set(visitsRows.map((r) => isoDay(r.d)));

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
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

/** Mavjud ma'lumot davri (default range hisoblash uchun). */
// unstable_cache Date serialize qila olmaydi — ISO string sifatida cache qilamiz.
const _cachedDefaultRange = unstable_cache(
  async (): Promise<{ start: string; end: string }> => {
    const [lastSale, lastMetric, lastVisit] = await Promise.all([
      prisma.categorySales.findFirst({ orderBy: { periodEnd: "desc" }, select: { periodEnd: true } }),
      prisma.dailyMetrics.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      prisma.dailyVisits.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    ]);
    const candidates = [lastSale?.periodEnd, lastMetric?.date, lastVisit?.date].filter(Boolean) as Date[];
    if (candidates.length === 0) {
      const now = new Date();
      return { start: isoDay(startOfMonth(now)), end: isoDay(endOfMonth(now)) };
    }
    const ref = new Date(Math.max(...candidates.map((d) => d.getTime())));
    return { start: isoDay(startOfMonth(ref)), end: isoDay(endOfMonth(ref)) };
  },
  ["defaultRange"],
  { tags: [ANALYTICS_CACHE_TAG], revalidate: 3600 }
);

export async function getDefaultRange(): Promise<DateRange> {
  const { start, end } = await _cachedDefaultRange();
  return {
    start: new Date(start + "T00:00:00.000Z"),
    end:   new Date(end   + "T00:00:00.000Z"),
  };
}
