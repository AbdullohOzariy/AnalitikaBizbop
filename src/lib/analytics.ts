import { prisma } from "@/lib/prisma";

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

/** Ikki davr kesishuvini topadi (yo'q bo'lsa null). Ikkala chet ham UTC date (kun boshi). */
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

/**
 * KPI kartalar uchun asosiy ko'rsatkichlarni hisoblaydi.
 * - Total Sales: CategorySales orqali (period overlap proporsional)
 * - Total Receipts: DailyMetrics.receiptCount
 * - Total Visits: DailyVisits.visitCount
 * - Avg Receipt: Sales / Receipts (bo'sh bo'lsa DailyMetrics.avgReceipt o'rtachasi)
 * - Conversion: Receipts / Visits × 100%
 */
export async function computeKPI(range: DateRange, branchId?: number): Promise<KPI> {
  const totalSales = await sumCategorySalesProRated(range, branchId);

  const metricsAgg = await prisma.dailyMetrics.aggregate({
    where: {
      date: { gte: range.start, lte: range.end },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { receiptCount: true, receiptTotal: true },
  });
  const totalReceipts = metricsAgg._sum.receiptCount ?? 0;

  const visitsAgg = await prisma.dailyVisits.aggregate({
    where: {
      date: { gte: range.start, lte: range.end },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { visitCount: true },
  });
  const totalVisits = visitsAgg._sum.visitCount ?? 0;

  const avgReceipt = totalReceipts > 0 ? totalSales / totalReceipts : 0;
  const conversion = totalVisits > 0 ? (totalReceipts / totalVisits) * 100 : 0;

  return { totalSales, totalReceipts, totalVisits, avgReceipt, conversion };
}

/**
 * CategorySales periodlarini tanlangan davrga proporsional bo'lib summalash.
 */
export async function sumCategorySalesProRated(
  range: DateRange,
  branchId?: number,
  categoryId?: number
): Promise<number> {
  const rows = await prisma.categorySales.findMany({
    where: {
      AND: [
        { periodStart: { lte: range.end } },
        { periodEnd: { gte: range.start } },
        ...(branchId ? [{ branchId }] : []),
        ...(categoryId ? [{ categoryId }] : []),
      ],
    },
    select: {
      amount: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  let total = 0;
  for (const r of rows) {
    const periodDays = diffDaysInclusive(r.periodStart, r.periodEnd);
    const overlap = overlapDays(range.start, range.end, r.periodStart, r.periodEnd);
    if (periodDays === 0) continue;
    total += Number(r.amount) * (overlap / periodDays);
  }
  return total;
}

/** Bir nechta CategorySales yozuvi davrga to'g'ri kelsa, ularni summa qilamiz lekin
 *  uzun davriy fayl + kunlik fayl bir-birini takrorlamasin uchun: bir davr ichida
 *  KENG (uzunroq) period ham mavjud bo'lsa, KIChIK (qisqaroq) periodlarni ustun ko'ramiz.
 *
 *  Bu murakkab — birinchi versiyada eng oddiyini qoldiramiz (tepada).
 *  Kelajakda overlap-deduplication qo'shamiz.
 */

export type DailyPoint = { date: string; value: number };

/** Kunlik savdo dinamikasi (DailyMetrics.receiptTotal asosida). */
export async function dailySalesSeries(
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
    date: r.date.toISOString().slice(0, 10),
    value: Number(r._sum.receiptTotal ?? 0),
  }));
}

/** Kunlik chek soni dinamikasi. */
export async function dailyReceiptsSeries(
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
    date: r.date.toISOString().slice(0, 10),
    value: Number(r._sum.receiptCount ?? 0),
  }));
}

/** Kunlik tashriflar dinamikasi. */
export async function dailyVisitsSeries(
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
    date: r.date.toISOString().slice(0, 10),
    value: Number(r._sum.visitCount ?? 0),
  }));
}

export type BranchShareRow = {
  branchId: number;
  branchName: string;
  sales: number;
  share: number; // 0..100
};

/** Filiallar bo'yicha savdo va ulush. */
export async function branchShare(range: DateRange): Promise<BranchShareRow[]> {
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const rows: BranchShareRow[] = [];
  let total = 0;
  for (const b of branches) {
    const sales = await sumCategorySalesProRated(range, b.id);
    rows.push({ branchId: b.id, branchName: b.name, sales, share: 0 });
    total += sales;
  }
  for (const r of rows) {
    r.share = total > 0 ? (r.sales / total) * 100 : 0;
  }
  return rows;
}

export type CategoryRow = {
  categoryId: number;
  categoryName: string;
  fact: number;
  plan: number;
  achievement: number; // % fact/plan
};

/** Top kategoriyalar (Fakt vs Plan). Plan oylik — tanlangan davrga proratsiyalanadi. */
export async function topCategories(
  range: DateRange,
  branchId?: number,
  limit = 10
): Promise<CategoryRow[]> {
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const result: CategoryRow[] = [];

  // Plan: oylik rejalarni topishni soddalashtirish — har oy uchun proratsiya
  for (const c of cats) {
    const fact = await sumCategorySalesProRated(range, branchId, c.id);
    const plan = await proratedPlan(range, c.id, branchId);
    result.push({
      categoryId: c.id,
      categoryName: c.name,
      fact,
      plan,
      achievement: plan > 0 ? (fact / plan) * 100 : 0,
    });
  }

  return result
    .sort((a, b) => b.fact - a.fact)
    .slice(0, limit);
}

/** Tanlangan davrda kategoriya uchun reja proratsiyasi. */
async function proratedPlan(
  range: DateRange,
  categoryId: number,
  branchId?: number
): Promise<number> {
  // Davrdagi har oy uchun reja (filial ko'rsatilmasa hamma filial yig'ib)
  const months: { year: number; month: number; daysInMonth: number; overlapDays: number }[] = [];
  const cur = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), 1));
  while (cur.getTime() <= stop.getTime()) {
    const mStart = new Date(cur);
    const mEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const overlap = overlapDays(range.start, range.end, mStart, mEnd);
    months.push({
      year: mStart.getUTCFullYear(),
      month: mStart.getUTCMonth() + 1,
      daysInMonth: diffDaysInclusive(mStart, mEnd),
      overlapDays: overlap,
    });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  let total = 0;
  for (const m of months) {
    const plans = await prisma.monthlyPlan.findMany({
      where: {
        year: m.year,
        month: m.month,
        categoryId,
        ...(branchId ? { branchId } : {}),
      },
      select: { planAmount: true },
    });
    const monthSum = plans.reduce((s, p) => s + Number(p.planAmount), 0);
    total += monthSum * (m.overlapDays / m.daysInMonth);
  }
  return total;
}

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

/** Filiallar Faoliyati jadvali. */
export async function branchPerformance(range: DateRange): Promise<BranchPerformanceRow[]> {
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const result: BranchPerformanceRow[] = [];
  for (const b of branches) {
    const kpi = await computeKPI(range, b.id);
    // Plan = barcha kategoriyalar bo'yicha jami reja
    const cats = await topCategories(range, b.id, 1000);
    const plan = cats.reduce((s, c) => s + c.plan, 0);
    result.push({
      branchId: b.id,
      branchName: b.name,
      sales: kpi.totalSales,
      receipts: kpi.totalReceipts,
      visits: kpi.totalVisits,
      plan,
      planPercent: plan > 0 ? (kpi.totalSales / plan) * 100 : 0,
      conversion: kpi.conversion,
      avgReceipt: kpi.avgReceipt,
    });
  }
  return result;
}

/** Mavjud ma'lumot davri (default range hisoblash uchun). */
export async function getDefaultRange(): Promise<DateRange> {
  // Eng so'nggi yozuv asosida joriy oy yoki shu oydagi mavjud kunlar.
  const lastSale = await prisma.categorySales.findFirst({
    orderBy: { periodEnd: "desc" },
    select: { periodEnd: true },
  });
  const lastMetric = await prisma.dailyMetrics.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const lastVisit = await prisma.dailyVisits.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const candidates = [lastSale?.periodEnd, lastMetric?.date, lastVisit?.date]
    .filter(Boolean) as Date[];
  if (candidates.length === 0) {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  const ref = new Date(Math.max(...candidates.map((d) => d.getTime())));
  return { start: startOfMonth(ref), end: endOfMonth(ref) };
}
