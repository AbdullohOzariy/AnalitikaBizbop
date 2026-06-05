import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { ANALYTICS_CACHE_TAG, type DateRange } from "@/lib/analytics";

/** Faqat ko'rinadigan kategoriyalar (sortOrder > 0). */
const VISIBLE_CAT_FILTER = Prisma.sql`
  AND EXISTS (
    SELECT 1 FROM "Category" "_c"
    WHERE "_c"."id" = "CategorySales"."categoryId" AND "_c"."sortOrder" > 0
  )
`;

const dayMs = 86_400_000;

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

// ============ Plan Completion ============

export type PlanCompletion = {
  /** Reja bajarilishi % — actual / plan * 100. Reja yoki fakt yo'q bo'lsa null. */
  pct: number | null;
  plan: number;
  actual: number;
};

export type PlanCompletionStats = {
  overall: PlanCompletion;
  byCategory: ({ categoryId: number; categoryName: string } & PlanCompletion)[];
  byBranch:   ({ branchId: number;   branchName: string }   & PlanCompletion)[];
};

async function _planCompletion(range: DateRange, branchId?: number): Promise<PlanCompletionStats> {
  const branchSql = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty;

  // 1. DailyPlan per (branch, category)
  const dailyRows = await prisma.$queryRaw<
    { branchId: number; categoryId: number; total: number | null }[]
  >`
    SELECT "branchId", "categoryId", COALESCE(SUM("planAmount"::numeric),0)::float8 AS total
    FROM "DailyPlan"
    WHERE date BETWEEN ${range.start} AND ${range.end}
    ${branchSql}
    GROUP BY "branchId", "categoryId"
  `;

  // 2. MonthlyPlan pro-rated per (branch, category) — fallback
  const months: { year: number; month: number; daysInMonth: number; overlapDays: number }[] = [];
  let cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  while (cursor <= range.end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const monthEnd = new Date(Date.UTC(y, m + 1, 0));
    const overlapStart = new Date(Math.max(cursor.getTime(), range.start.getTime()));
    const overlapEnd   = new Date(Math.min(monthEnd.getTime(), range.end.getTime()));
    const overlapDays  = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / dayMs) + 1;
    const daysInMonth  = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    months.push({ year: y, month: m + 1, daysInMonth, overlapDays });
    cursor = new Date(Date.UTC(y, m + 1, 1));
  }

  const monthlyMap = new Map<string, number>(); // key=branchId-categoryId
  if (months.length > 0) {
    const ymPairs = Prisma.join(months.map((m) => Prisma.sql`(${m.year}, ${m.month})`));
    const rows = await prisma.$queryRaw<
      { branchId: number; categoryId: number; year: number; month: number; total: number | null }[]
    >`
      SELECT "branchId", "categoryId", "year", "month",
             COALESCE(SUM("planAmount"::numeric),0)::float8 AS total
      FROM "MonthlyPlan"
      WHERE ("year","month") IN (${ymPairs})
      ${branchSql}
      GROUP BY "branchId", "categoryId", "year", "month"
    `;
    const monthMeta = new Map(months.map((m) => [`${m.year}-${m.month}`, m]));
    for (const r of rows) {
      const meta = monthMeta.get(`${r.year}-${r.month}`);
      if (!meta) continue;
      const prorated = Number(r.total ?? 0) * (meta.overlapDays / meta.daysInMonth);
      const key = `${r.branchId}-${r.categoryId}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + prorated);
    }
  }

  // Effective plan: prefer DailyPlan, fallback MonthlyPlan
  const dailyMap = new Map<string, number>();
  for (const r of dailyRows) {
    dailyMap.set(`${r.branchId}-${r.categoryId}`, Number(r.total ?? 0));
  }
  const effectivePlanMap = new Map<string, number>(monthlyMap);
  for (const [k, v] of dailyMap) effectivePlanMap.set(k, v); // override with DailyPlan when exists

  // 3. Actual sales pro-rated per (branch, category)
  const salesRows = await prisma.$queryRaw<
    { branchId: number; categoryId: number; total: number | null }[]
  >`
    SELECT "branchId", "categoryId",
           COALESCE(SUM(
             amount::numeric * (
               (LEAST("periodEnd", ${range.end}::date) - GREATEST("periodStart", ${range.start}::date) + 1)::float8
               / NULLIF(("periodEnd" - "periodStart" + 1)::float8, 0)
             )
           ), 0)::float8 AS total
    FROM "CategorySales"
    WHERE "periodEnd" >= ${range.start} AND "periodStart" <= ${range.end}
    ${branchSql}
    ${VISIBLE_CAT_FILTER}
    GROUP BY "branchId", "categoryId"
  `;
  const actualMap = new Map<string, number>();
  for (const r of salesRows) {
    actualMap.set(`${r.branchId}-${r.categoryId}`, Number(r.total ?? 0));
  }

  // Aggregations
  const [branches, categories] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    // sortOrder > 0 — faqat ko'rinadigan kategoriyalar (VISIBLE_CAT_FILTER bilan izchil)
    prisma.category.findMany({ where: { parentId: null, sortOrder: { gt: 0 } }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Ko'rinadigan kategoriya ID to'plami — plan tomoni ham shu set orqali filtrlash.
  // effectivePlanMap ko'rinmas kategoriyalarni o'z ichiga olishi mumkin (sortOrder=0
  // bo'lgan kategoriyalar DailyPlan/MonthlyPlan'da plan sifatida yozilgan bo'lsa).
  // actualMap VISIBLE_CAT_FILTER tufayli faqat ko'rinadigan kategoriyalarni o'z ichiga oladi.
  // allKeys ikkalasidan union emas — faqat ko'rinadigan kategoriyalar uchun hisob olinadi.
  const visibleCatIds = new Set(categories.map((c) => c.id));

  let totalPlan = 0;
  let totalActual = 0;
  const byBranchAgg = new Map<number, { plan: number; actual: number }>();
  const byCatAgg    = new Map<number, { plan: number; actual: number }>();

  // Ko'rinmas kategoriyalar plan tomondan ham olib tashlanadi
  const allKeys = new Set([...actualMap.keys()]);
  for (const k of effectivePlanMap.keys()) {
    const cid = Number(k.split("-")[1]);
    if (visibleCatIds.has(cid)) allKeys.add(k);
  }
  for (const key of allKeys) {
    const [bid, cid] = key.split("-").map(Number);
    const plan   = effectivePlanMap.get(key) ?? 0;
    const actual = actualMap.get(key) ?? 0;
    totalPlan   += plan;
    totalActual += actual;
    const b = byBranchAgg.get(bid) ?? { plan: 0, actual: 0 };
    b.plan += plan; b.actual += actual;
    byBranchAgg.set(bid, b);
    const c = byCatAgg.get(cid) ?? { plan: 0, actual: 0 };
    c.plan += plan; c.actual += actual;
    byCatAgg.set(cid, c);
  }

  const calcPct = (plan: number, actual: number) =>
    plan > 0 ? (actual / plan) * 100 : null;

  return {
    overall: { plan: totalPlan, actual: totalActual, pct: calcPct(totalPlan, totalActual) },
    byCategory: categories.map((c) => {
      const a = byCatAgg.get(c.id) ?? { plan: 0, actual: 0 };
      return {
        categoryId: c.id,
        categoryName: c.name,
        plan: a.plan,
        actual: a.actual,
        pct: calcPct(a.plan, a.actual),
      };
    }).filter((r) => r.plan > 0 || r.actual > 0),
    byBranch: branches.map((b) => {
      const a = byBranchAgg.get(b.id) ?? { plan: 0, actual: 0 };
      return {
        branchId: b.id,
        branchName: b.name,
        plan: a.plan,
        actual: a.actual,
        pct: calcPct(a.plan, a.actual),
      };
    }).filter((r) => r.plan > 0 || r.actual > 0),
  };
}

export const planCompletion = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _planCompletion(range, branchId),
    ["v2_planCompletion", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ Daily series by branch (visits + receipts) ============

export type DailyByBranchSeries = {
  dates: string[]; // ISO YYYY-MM-DD
  branches: { id: number; name: string }[];
  /** values[i][branchId] = qiymat. Yo'q bo'lsa 0. */
  values: { date: string; [branchKey: string]: number | string }[];
};

async function _dailyVisitsByBranch(range: DateRange): Promise<DailyByBranchSeries> {
  const [branches, rows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.$queryRaw<{ d: Date; branchId: number; v: number }[]>`
      SELECT date AS d, "branchId", "visitCount" AS v
      FROM "DailyVisits"
      WHERE date BETWEEN ${range.start} AND ${range.end}
    `,
  ]);
  return buildSeries(range, branches, rows);
}
async function _dailyReceiptsByBranch(range: DateRange): Promise<DailyByBranchSeries> {
  const [branches, rows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.$queryRaw<{ d: Date; branchId: number; v: number }[]>`
      SELECT date AS d, "branchId", "receiptCount" AS v
      FROM "DailyMetrics"
      WHERE date BETWEEN ${range.start} AND ${range.end}
    `,
  ]);
  return buildSeries(range, branches, rows);
}

async function _dailyAvgReceiptByBranch(range: DateRange): Promise<DailyByBranchSeries> {
  const [branches, rows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.$queryRaw<{ d: Date; branchId: number; v: number }[]>`
      SELECT date AS d, "branchId", "avgReceipt"::float8 AS v
      FROM "DailyMetrics"
      WHERE date BETWEEN ${range.start} AND ${range.end}
    `,
  ]);
  return buildSeries(range, branches, rows);
}

function buildSeries(
  range: DateRange,
  branches: { id: number; name: string }[],
  rows: { d: Date; branchId: number; v: number }[]
): DailyByBranchSeries {
  const dataMap = new Map<string, Map<number, number>>(); // date → branchId → val
  for (const r of rows) {
    const k = isoDay(r.d);
    if (!dataMap.has(k)) dataMap.set(k, new Map());
    dataMap.get(k)!.set(r.branchId, Number(r.v));
  }
  const dates: string[] = [];
  const values: { date: string; [k: string]: number | string }[] = [];
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += dayMs) {
    const iso = isoDay(new Date(t));
    dates.push(iso);
    const dayMap = dataMap.get(iso);
    const row: { date: string; [k: string]: number | string } = { date: iso };
    for (const b of branches) row[`b${b.id}`] = dayMap?.get(b.id) ?? 0;
    values.push(row);
  }
  return { dates, branches: branches.map((b) => ({ id: b.id, name: b.name })), values };
}

export const dailyVisitsByBranch = (range: DateRange) =>
  unstable_cache(
    () => _dailyVisitsByBranch(range),
    ["v2_dailyVisits", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();
export const dailyReceiptsByBranch = (range: DateRange) =>
  unstable_cache(
    () => _dailyReceiptsByBranch(range),
    ["v2_dailyReceipts", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

export const dailyAvgReceiptByBranch = (range: DateRange) =>
  unstable_cache(
    () => _dailyAvgReceiptByBranch(range),
    ["v2_dailyAvgReceipt", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ Marja breakdown (category + branch) ============

export type MarjaRow = {
  id: number;
  name: string;
  sales: number;
  cost: number;
  /** Marja % = (sales - cost) / cost * 100. Cost == 0 bo'lsa null. */
  marja: number | null;
};

async function _marjaBreakdown(range: DateRange, branchId?: number): Promise<{
  byCategory: MarjaRow[];
  byBranch:   MarjaRow[];
}> {
  const branchSql = branchId ? Prisma.sql`AND cs."branchId" = ${branchId}` : Prisma.empty;

  const proRated = Prisma.sql`
    cs.amount::numeric * (
      (LEAST(cs."periodEnd", ${range.end}::date) - GREATEST(cs."periodStart", ${range.start}::date) + 1)::float8
      / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
    )
  `;
  const proRatedCost = Prisma.sql`
    cs."costAmount"::numeric * (
      (LEAST(cs."periodEnd", ${range.end}::date) - GREATEST(cs."periodStart", ${range.start}::date) + 1)::float8
      / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
    )
  `;

  const byCat = await prisma.$queryRaw<{ id: number; name: string; sales: number | null; cost: number | null }[]>`
    SELECT c.id AS id, c.name AS name,
           COALESCE(SUM(${proRated}), 0)::float8 AS sales,
           COALESCE(SUM(${proRatedCost}), 0)::float8 AS cost
    FROM "CategorySales" cs
    JOIN "Category" c ON c.id = cs."categoryId"
    WHERE cs."periodEnd" >= ${range.start} AND cs."periodStart" <= ${range.end}
      AND c."sortOrder" > 0
    ${branchSql}
    GROUP BY c.id, c.name, c."sortOrder"
    ORDER BY c."sortOrder" ASC
  `;
  const byBranchRows = await prisma.$queryRaw<{ id: number; name: string; sales: number | null; cost: number | null }[]>`
    SELECT b.id AS id, b.name AS name,
           COALESCE(SUM(${proRated}), 0)::float8 AS sales,
           COALESCE(SUM(${proRatedCost}), 0)::float8 AS cost
    FROM "CategorySales" cs
    JOIN "Branch" b ON b.id = cs."branchId"
    JOIN "Category" cat ON cat.id = cs."categoryId"
    WHERE cs."periodEnd" >= ${range.start} AND cs."periodStart" <= ${range.end}
      AND cat."sortOrder" > 0
    ${branchSql}
    GROUP BY b.id, b.name, b."sortOrder"
    ORDER BY b."sortOrder" ASC
  `;

  const toRow = (r: { id: number; name: string; sales: number | null; cost: number | null }): MarjaRow => {
    const sales = Number(r.sales ?? 0);
    const cost  = Number(r.cost ?? 0);
    return {
      id: r.id,
      name: r.name,
      sales,
      cost,
      marja: sales > 0 ? ((sales - cost) / sales) * 100 : null,
    };
  };
  return {
    byCategory: byCat.map(toRow).filter((r) => r.sales > 0),
    byBranch:   byBranchRows.map(toRow).filter((r) => r.sales > 0),
  };
}

export const marjaBreakdown = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _marjaBreakdown(range, branchId),
    ["v2_marja", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ KPI by branch (conversion + avg items per receipt) ============

export type KpiByBranchRow = {
  branchId: number;
  branchName: string;
  receipts: number;
  visits: number;
  conversion: number | null;       // %
  avgItemsPerReceipt: number | null;
};

async function _kpiByBranch(range: DateRange): Promise<KpiByBranchRow[]> {
  const [branches, mRows, vRows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.$queryRaw<{ branchId: number; receipts: number; avgItems: number | null }[]>`
      SELECT "branchId",
             COALESCE(SUM("receiptCount"),0)::int AS receipts,
             CASE WHEN SUM("receiptCount") > 0
                  THEN SUM("avgItemsPerReceipt"::numeric * "receiptCount") / SUM("receiptCount")
                  ELSE 0 END::float8 AS "avgItems"
      FROM "DailyMetrics"
      WHERE date BETWEEN ${range.start} AND ${range.end}
      GROUP BY "branchId"
    `,
    prisma.$queryRaw<{ branchId: number; visits: number }[]>`
      SELECT "branchId", COALESCE(SUM("visitCount"),0)::int AS visits
      FROM "DailyVisits"
      WHERE date BETWEEN ${range.start} AND ${range.end}
      GROUP BY "branchId"
    `,
  ]);
  const mMap = new Map(mRows.map((r) => [r.branchId, r]));
  const vMap = new Map(vRows.map((r) => [r.branchId, r.visits]));

  return branches.map((b) => {
    const m = mMap.get(b.id);
    const receipts = m?.receipts ?? 0;
    const visits   = vMap.get(b.id) ?? 0;
    return {
      branchId: b.id,
      branchName: b.name,
      receipts,
      visits,
      conversion: visits > 0 ? (receipts / visits) * 100 : null,
      avgItemsPerReceipt: receipts > 0 ? Number(m?.avgItems ?? 0) : null,
    };
  });
}

export const kpiByBranch = (range: DateRange) =>
  unstable_cache(
    () => _kpiByBranch(range),
    ["v2_kpiByBranch", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ Guruh/Kategoriya bo'yicha kunlik savdo dinamikasi ============

export type GroupSalesDayRow = {
  date: string;                                       // ISO YYYY-MM-DD
  total: number;                                      // barcha guruhlar jami
  groups: { groupId: number; groupName: string; amount: number }[];
};

export type CategorySalesDayRow = {
  date: string;
  total: number;                                      // guruh ichidagi jami
  categories: { categoryId: number; categoryName: string; amount: number; pct: number }[];
};

async function _dailySalesByGroup(
  range: DateRange,
  branchId?: number
): Promise<{ days: GroupSalesDayRow[]; groups: { id: number; name: string }[] }> {
  const branchSql = branchId ? Prisma.sql`AND cs."branchId" = ${branchId}` : Prisma.empty;

  // Kunlik pro-rated savdo: guruh bo'yicha
  const rows = await prisma.$queryRaw<
    { d: string; groupId: number; groupName: string; amount: number }[]
  >`
    SELECT
      g.s::text                           AS d,
      cg.id                               AS "groupId",
      cg.name                             AS "groupName",
      COALESCE(SUM(
        cs.amount::numeric * (
          (LEAST(cs."periodEnd", ${range.end}::date) - GREATEST(cs."periodStart", g.s::date) + 1)::float8
          / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
        )
      ), 0)::float8                        AS amount
    FROM generate_series(${range.start}::date, ${range.end}::date, '1 day'::interval) AS g(s)
    CROSS JOIN "CategoryGroup" cg
    LEFT JOIN "Category" cat ON cat."groupId" = cg.id AND cat."parentId" IS NULL AND cat."sortOrder" > 0
    LEFT JOIN "CategorySales" cs
      ON cs."categoryId" = cat.id
      AND cs."periodStart" <= g.s::date
      AND cs."periodEnd"   >= g.s::date
      ${branchSql}
    GROUP BY g.s, cg.id, cg.name
    ORDER BY g.s, cg."sortOrder"
  `;

  // Guruhlar ro'yxati (tartib saqlansin)
  const groupMap = new Map<number, string>();
  for (const r of rows) groupMap.set(r.groupId, r.groupName);
  const groups = [...groupMap.entries()].map(([id, name]) => ({ id, name }));

  // Kunlar bo'yicha birlashtirish
  const dayMap = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (!dayMap.has(r.d)) dayMap.set(r.d, new Map());
    dayMap.get(r.d)!.set(r.groupId, Number(r.amount));
  }

  const days: GroupSalesDayRow[] = [];
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += dayMs) {
    const iso = isoDay(new Date(t));
    const gMap = dayMap.get(iso) ?? new Map();
    const groupAmounts = groups.map((g) => ({ groupId: g.id, groupName: g.name, amount: gMap.get(g.id) ?? 0 }));
    const total = groupAmounts.reduce((s, g) => s + g.amount, 0);
    days.push({ date: iso, total, groups: groupAmounts });
  }
  return { days, groups };
}

export const dailySalesByGroup = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _dailySalesByGroup(range, branchId),
    ["v2_dailySalesByGroup", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

async function _dailySalesByCategory(
  range: DateRange,
  groupId: number,
  branchId?: number
): Promise<{ days: CategorySalesDayRow[]; categories: { id: number; name: string }[] }> {
  const branchSql = branchId ? Prisma.sql`AND cs."branchId" = ${branchId}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { d: string; categoryId: number; categoryName: string; amount: number }[]
  >`
    SELECT
      g.s::text                           AS d,
      cat.id                              AS "categoryId",
      cat.name                            AS "categoryName",
      COALESCE(SUM(
        cs.amount::numeric * (
          (LEAST(cs."periodEnd", ${range.end}::date) - GREATEST(cs."periodStart", g.s::date) + 1)::float8
          / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
        )
      ), 0)::float8                        AS amount
    FROM generate_series(${range.start}::date, ${range.end}::date, '1 day'::interval) AS g(s)
    CROSS JOIN "Category" cat
    LEFT JOIN "CategorySales" cs
      ON cs."categoryId" = cat.id
      AND cs."periodStart" <= g.s::date
      AND cs."periodEnd"   >= g.s::date
      ${branchSql}
    WHERE cat."groupId" = ${groupId}
      AND cat."parentId" IS NULL
      AND cat."sortOrder" > 0
    GROUP BY g.s, cat.id, cat.name, cat."sortOrder"
    ORDER BY g.s, cat."sortOrder"
  `;

  const catMap = new Map<number, string>();
  for (const r of rows) catMap.set(r.categoryId, r.categoryName);
  const categories = [...catMap.entries()].map(([id, name]) => ({ id, name }));

  const dayMap = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (!dayMap.has(r.d)) dayMap.set(r.d, new Map());
    dayMap.get(r.d)!.set(r.categoryId, Number(r.amount));
  }

  const days: CategorySalesDayRow[] = [];
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += dayMs) {
    const iso = isoDay(new Date(t));
    const cMap = dayMap.get(iso) ?? new Map();
    const catAmounts = categories.map((c) => ({ categoryId: c.id, categoryName: c.name, amount: cMap.get(c.id) ?? 0 }));
    const total = catAmounts.reduce((s, c) => s + c.amount, 0);
    days.push({
      date: iso,
      total,
      categories: catAmounts.map((c) => ({
        ...c,
        pct: total > 0 ? (c.amount / total) * 100 : 0,
      })),
    });
  }
  return { days, categories };
}

export const dailySalesByCategory = (range: DateRange, groupId: number, branchId?: number) =>
  unstable_cache(
    () => _dailySalesByCategory(range, groupId, branchId),
    ["v2_dailySalesByCategory", ...makeKey(range, branchId, `g${groupId}`)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();
