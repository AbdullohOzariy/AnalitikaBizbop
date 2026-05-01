import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";

export const ANALYTICS_CACHE_TAG = "analytics";

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
    GROUP BY "categoryId"
  `;
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.categoryId, Number(r.total ?? 0));
  return map;
}

/** Davrdagi har oy uchun {year, month, daysInMonth, overlapDays}. */
function monthsInRange(range: DateRange) {
  const months: { year: number; month: number; daysInMonth: number; overlapDays: number }[] = [];
  const cur = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), 1));
  while (cur.getTime() <= stop.getTime()) {
    const mStart = new Date(cur);
    const mEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    months.push({
      year: mStart.getUTCFullYear(),
      month: mStart.getUTCMonth() + 1,
      daysInMonth: diffDaysInclusive(mStart, mEnd),
      overlapDays: overlapDays(range.start, range.end, mStart, mEnd),
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
}

/** Reja: kategoriya bo'yicha (1 query). */
async function _planByCategory(
  range: DateRange,
  branchId?: number
): Promise<Map<number, number>> {
  const months = monthsInRange(range);
  if (months.length === 0) return new Map();
  const ymPairs = Prisma.join(
    months.map((m) => Prisma.sql`(${m.year}, ${m.month})`)
  );
  const rows = await prisma.$queryRaw<
    { categoryId: number; year: number; month: number; total: number | null }[]
  >`
    SELECT "categoryId", "year", "month",
           COALESCE(SUM("planAmount"::numeric), 0)::float8 AS total
    FROM "MonthlyPlan"
    WHERE ("year", "month") IN (${ymPairs})
      ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
    GROUP BY "categoryId", "year", "month"
  `;
  const monthMeta = new Map(months.map((m) => [`${m.year}-${m.month}`, m]));
  const map = new Map<number, number>();
  for (const r of rows) {
    const meta = monthMeta.get(`${r.year}-${r.month}`);
    if (!meta || meta.daysInMonth === 0) continue;
    const prorated = Number(r.total ?? 0) * (meta.overlapDays / meta.daysInMonth);
    map.set(r.categoryId, (map.get(r.categoryId) ?? 0) + prorated);
  }
  return map;
}

/** Reja: filial bo'yicha (1 query). */
async function _planByBranch(range: DateRange): Promise<Map<number, number>> {
  const months = monthsInRange(range);
  if (months.length === 0) return new Map();
  const ymPairs = Prisma.join(
    months.map((m) => Prisma.sql`(${m.year}, ${m.month})`)
  );
  const rows = await prisma.$queryRaw<
    { branchId: number; year: number; month: number; total: number | null }[]
  >`
    SELECT "branchId", "year", "month",
           COALESCE(SUM("planAmount"::numeric), 0)::float8 AS total
    FROM "MonthlyPlan"
    WHERE ("year", "month") IN (${ymPairs})
    GROUP BY "branchId", "year", "month"
  `;
  const monthMeta = new Map(months.map((m) => [`${m.year}-${m.month}`, m]));
  const map = new Map<number, number>();
  for (const r of rows) {
    const meta = monthMeta.get(`${r.year}-${r.month}`);
    if (!meta || meta.daysInMonth === 0) continue;
    const prorated = Number(r.total ?? 0) * (meta.overlapDays / meta.daysInMonth);
    map.set(r.branchId, (map.get(r.branchId) ?? 0) + prorated);
  }
  return map;
}

/** Filial bo'yicha kunlik metrika summalari (1 query). */
async function _metricsByBranch(
  range: DateRange
): Promise<Map<number, { receipts: number; receiptTotal: number }>> {
  const rows = await prisma.dailyMetrics.groupBy({
    by: ["branchId"],
    where: { date: { gte: range.start, lte: range.end } },
    _sum: { receiptCount: true, receiptTotal: true },
  });
  const map = new Map<number, { receipts: number; receiptTotal: number }>();
  for (const r of rows) {
    map.set(r.branchId, {
      receipts: r._sum.receiptCount ?? 0,
      receiptTotal: Number(r._sum.receiptTotal ?? 0),
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
  const [totalSales, metricsAgg, visitsAgg] = await Promise.all([
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
  ]);

  const totalReceipts = metricsAgg._sum.receiptCount ?? 0;
  const totalVisits = visitsAgg._sum.visitCount ?? 0;
  const avgReceipt = totalReceipts > 0 ? totalSales / totalReceipts : 0;
  const conversion = totalVisits > 0 ? (totalReceipts / totalVisits) * 100 : 0;

  return { totalSales, totalReceipts, totalVisits, avgReceipt, conversion };
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
  plan: number;
  achievement: number;
};

async function _topCategories(
  range: DateRange,
  branchId?: number,
  limit = 10
): Promise<CategoryRow[]> {
  const [cats, factMap, planMap] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    _salesByCategory(range, branchId),
    _planByCategory(range, branchId),
  ]);
  const rows: CategoryRow[] = cats.map((c) => {
    const fact = factMap.get(c.id) ?? 0;
    const plan = planMap.get(c.id) ?? 0;
    return {
      categoryId: c.id,
      categoryName: c.name,
      fact,
      plan,
      achievement: plan > 0 ? (fact / plan) * 100 : 0,
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
  plan: number;
  planPercent: number;
  conversion: number;
  avgReceipt: number;
};

async function _branchPerformance(range: DateRange): Promise<BranchPerformanceRow[]> {
  const [branches, salesMap, metricsMap, visitsMap, planMap] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    _salesByBranch(range),
    _metricsByBranch(range),
    _visitsByBranch(range),
    _planByBranch(range),
  ]);
  return branches.map((b) => {
    const sales = salesMap.get(b.id) ?? 0;
    const m = metricsMap.get(b.id) ?? { receipts: 0, receiptTotal: 0 };
    const visits = visitsMap.get(b.id) ?? 0;
    const plan = planMap.get(b.id) ?? 0;
    const avgReceipt = m.receipts > 0 ? sales / m.receipts : 0;
    const conversion = visits > 0 ? (m.receipts / visits) * 100 : 0;
    return {
      branchId: b.id,
      branchName: b.name,
      sales,
      receipts: m.receipts,
      visits,
      plan,
      planPercent: plan > 0 ? (sales / plan) * 100 : 0,
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

/** Mavjud ma'lumot davri (default range hisoblash uchun). */
async function _getDefaultRange(): Promise<DateRange> {
  const [lastSale, lastMetric, lastVisit] = await Promise.all([
    prisma.categorySales.findFirst({
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true },
    }),
    prisma.dailyMetrics.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.dailyVisits.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);

  const candidates = [lastSale?.periodEnd, lastMetric?.date, lastVisit?.date]
    .filter(Boolean) as Date[];
  if (candidates.length === 0) {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  const ref = new Date(Math.max(...candidates.map((d) => d.getTime())));
  return { start: startOfMonth(ref), end: endOfMonth(ref) };
}

export const getDefaultRange = unstable_cache(
  _getDefaultRange,
  ["getDefaultRange"],
  { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
);
