import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { ANALYTICS_CACHE_TAG, type DateRange } from "@/lib/analytics";

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
      FROM "DailyReceiptMetric"
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
    ["v3_dailyVisits", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();
export const dailyReceiptsByBranch = (range: DateRange) =>
  unstable_cache(
    () => _dailyReceiptsByBranch(range),
    ["v3_dailyReceipts", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ Marja breakdown (category + branch) ============

export type MarjaRow = {
  id: number;
  name: string;
  sales: number;
  cost: number;
  /** Marja % = (sales - cost) / sales * 100. Sales == 0 bo'lsa null. */
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
    WHERE cs."periodEnd" >= ${range.start} AND cs."periodStart" <= ${range.end}    ${branchSql}
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
    WHERE cs."periodEnd" >= ${range.start} AND cs."periodStart" <= ${range.end}    ${branchSql}
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
    ["v3_marja", ...makeKey(range, branchId)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ Marja iyerarxiyasi: Guruh → Kategoriya ============

export type MarjaGroupNode = MarjaRow & { categories: MarjaRow[] };

async function _marjaHierarchy(range: DateRange, branchId?: number): Promise<MarjaGroupNode[]> {
  const branchSql = branchId ? Prisma.sql`AND cs."branchId" = ${branchId}` : Prisma.empty;
  const frac = Prisma.sql`(
    (LEAST(cs."periodEnd", ${range.end}::date) - GREATEST(cs."periodStart", ${range.start}::date) + 1)::float8
    / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
  )`;

  // CategorySales (subkat darajasi) → ota-kategoriya → guruh
  const rows = await prisma.$queryRaw<
    { gid: number; gname: string; cid: number; cname: string; sales: number | null; cost: number | null }[]
  >`
    SELECT g.id AS gid, g.name AS gname, par.id AS cid, par.name AS cname,
           COALESCE(SUM(cs.amount::numeric * ${frac}), 0)::float8 AS sales,
           COALESCE(SUM(cs."costAmount"::numeric * ${frac}), 0)::float8 AS cost
    FROM "CategorySales" cs
    JOIN "Category" sub ON sub.id = cs."categoryId"
    JOIN "Category" par ON par.id = sub."parentId"
    JOIN "CategoryGroup" g ON g.id = par."groupId"
    WHERE cs."periodEnd" >= ${range.start} AND cs."periodStart" <= ${range.end}    ${branchSql}
    GROUP BY g.id, g.name, g."sortOrder", par.id, par.name, par."sortOrder"
    ORDER BY g."sortOrder" ASC, par."sortOrder" ASC
  `;

  const mk = (id: number, name: string, sales: number, cost: number): MarjaRow => ({
    id, name, sales, cost, marja: sales > 0 ? ((sales - cost) / sales) * 100 : null,
  });

  const groupMap = new Map<number, { name: string; sales: number; cost: number; cats: MarjaRow[] }>();
  for (const r of rows) {
    const sales = Number(r.sales ?? 0), cost = Number(r.cost ?? 0);
    if (sales <= 0) continue;
    let g = groupMap.get(r.gid);
    if (!g) { g = { name: r.gname, sales: 0, cost: 0, cats: [] }; groupMap.set(r.gid, g); }
    g.sales += sales; g.cost += cost;
    g.cats.push(mk(r.cid, r.cname, sales, cost));
  }
  return [...groupMap.entries()].map(([gid, g]) => ({
    ...mk(gid, g.name, g.sales, g.cost),
    categories: g.cats.sort((a, b) => (b.marja ?? -100) - (a.marja ?? -100)),
  }));
}

// Keshsiz — savdo ulushi donut (SalesShareWidget) har doim fresh.
export const marjaHierarchy = (range: DateRange, branchId?: number) =>
  _marjaHierarchy(range, branchId);

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
                  THEN SUM("itemsPerReceipt"::numeric * "receiptCount") / SUM("receiptCount")
                  ELSE 0 END::float8 AS "avgItems"
      FROM "DailyReceiptMetric"
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
    ["v3_kpiByBranch", ...makeKey(range)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();

// ============ Guruh/Kategoriya bo'yicha kunlik savdo dinamikasi ============

export type GroupSalesDayRow = {
  date: string;                                       // ISO YYYY-MM-DD
  total: number;                                      // barcha guruhlar jami
  groups: { groupId: number; groupName: string; amount: number }[];
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
      g.s::date::text                     AS d,
      cg.id                               AS "groupId",
      cg.name                             AS "groupName",
      COALESCE(SUM(
        cs.amount::numeric / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
      ), 0)::float8                        AS amount
    FROM generate_series(${range.start}::date, ${range.end}::date, '1 day'::interval) AS g(s)
    CROSS JOIN "CategoryGroup" cg
    LEFT JOIN "Category" par ON par."groupId" = cg.id AND par."parentId" IS NULL
    LEFT JOIN "Category" sub ON sub."parentId" = par.id
    LEFT JOIN "CategorySales" cs
      ON cs."categoryId" = sub.id
      AND cs."periodStart" <= g.s::date
      AND cs."periodEnd"   >= g.s::date
      ${branchSql}
    GROUP BY g.s, cg.id, cg.name, cg."sortOrder"
    ORDER BY g.s, cg."sortOrder"
  `;

  // Guruhlar ro'yxati (tartib saqlansin)
  const groupMap = new Map<number, string>();
  for (const r of rows) groupMap.set(r.groupId, r.groupName);
  const groups = [...groupMap.entries()].map(([id, name]) => ({ id, name }));

  // Kunlar bo'yicha birlashtirish (kalit — toza YYYY-MM-DD, isoDay bilan mos)
  const dayMap = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const dk = r.d.slice(0, 10);
    if (!dayMap.has(dk)) dayMap.set(dk, new Map());
    dayMap.get(dk)!.set(r.groupId, Number(r.amount));
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

// Keshsiz — to'g'ridan-to'g'ri DB (unstable_cache stale Fakt'ni qotirib qo'yardi).
export const dailySalesByGroup = (range: DateRange, branchId?: number) =>
  _dailySalesByGroup(range, branchId);

// ============ Guruh bo'yicha kunlik REJA (Reja vs Fakt dinamikasi uchun) ============
//
// Fakt (dailySalesByGroup) bilan yonma-yon ishlatish uchun har guruhning kunlik
// rejasini hisoblaymiz. Manbalar:
//   • SalesPlan (subkat, oylik) → ota(parentId) → guruh(groupId) bo'yicha rollup
//     = guruh oylik rejasi (gruh, year, month).
//   • ForecastDay (filial, kunlik JAMI reja) → kunlik "shakl".
// Formula: reja[guruh][kun] = forecastDay_jami[kun] × (guruh_oy_reja / jami_oy_reja[oy]).
// Fallback (oy uchun ForecastDay yo'q): guruh_oy_reja ni oy kunlariga TENG taqsimla.
// branchId filtri SalesPlan va ForecastDay ikkalasiga ham qo'llanadi.

export type GroupPlanDayRow = {
  date: string;                                       // ISO YYYY-MM-DD
  total: number;                                      // barcha guruhlar jami reja
  groups: { groupId: number; groupName: string; plan: number }[];
};

function daysInMonthUTC(year: number, month1: number): number {
  // month1: 1–12
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

async function _dailyPlanByGroup(
  range: DateRange,
  branchId?: number
): Promise<{ days: GroupPlanDayRow[]; groups: { id: number; name: string }[] }> {
  const planBranchSql = branchId ? Prisma.sql`AND sp."branchId" = ${branchId}` : Prisma.empty;
  const fdBranchSql = branchId ? Prisma.sql`AND fd."branchId" = ${branchId}` : Prisma.empty;

  // 1) Guruh oylik rejasi: SalesPlan (subkat) → ota → guruh.
  //    forecast.ts kabi COALESCE(par.groupId, sub.groupId) — reja to'g'ridan-to'g'ri
  //    top-kat'ga kiritilgan bo'lsa ham guruhni topamiz.
  //    Faqat range bilan kesishadigan (year, month) larni olamiz.
  const [planRows, groupRows, fdRows] = await Promise.all([
    prisma.$queryRaw<
      { gid: number; gname: string; year: number; month: number; amt: number }[]
    >`
      SELECT g.id AS gid, g.name AS gname, sp.year AS year, sp.month AS month,
             SUM(sp.amount)::float8 AS amt
      FROM "SalesPlan" sp
      JOIN "Category" sub ON sub.id = sp."categoryId"
      LEFT JOIN "Category" par ON par.id = sub."parentId"
      JOIN "CategoryGroup" g ON g.id = COALESCE(par."groupId", sub."groupId")
      WHERE make_date(sp.year, sp.month, 1) <= ${range.end}::date
        AND (make_date(sp.year, sp.month, 1) + interval '1 month' - interval '1 day')::date >= ${range.start}::date
        ${planBranchSql}
      GROUP BY g.id, g.name, g."sortOrder", sp.year, sp.month
      ORDER BY g."sortOrder" ASC
    `,
    // Guruhlar ro'yxati/tartibi — fakt bilan bir xil bo'lsin (CategoryGroup sortOrder).
    prisma.$queryRaw<{ id: number; name: string }[]>`
      SELECT id, name FROM "CategoryGroup" ORDER BY "sortOrder" ASC
    `,
    // ForecastDay kunlik jami (filiallar bo'yicha SUM yoki bitta filial).
    prisma.$queryRaw<{ d: string; year: number; month: number; v: number }[]>`
      SELECT fd."date"::text AS d, fd.year AS year, fd.month AS month,
             COALESCE(SUM(fd.amount), 0)::float8 AS v
      FROM "ForecastDay" fd
      WHERE fd."date" BETWEEN ${range.start}::date AND ${range.end}::date
        ${fdBranchSql}
      GROUP BY fd."date", fd.year, fd.month
    `,
  ]);

  const groups = groupRows.map((g) => ({ id: g.id, name: g.name }));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  // Guruh oylik rejasi: monthKey "YYYY-MM" → groupId → amount
  const monthGroupPlan = new Map<string, Map<number, number>>();
  // Oylik jami reja: monthKey → amount (taqsimot ulushini hisoblash uchun)
  const monthTotalPlan = new Map<string, number>();
  for (const r of planRows) {
    const mk = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const amt = Number(r.amt);
    if (!monthGroupPlan.has(mk)) monthGroupPlan.set(mk, new Map());
    const gm = monthGroupPlan.get(mk)!;
    gm.set(r.gid, (gm.get(r.gid) ?? 0) + amt);
    monthTotalPlan.set(mk, (monthTotalPlan.get(mk) ?? 0) + amt);
  }

  // ForecastDay kunlik jami: ISO date → amount; va oy bo'yicha jami (ulush kaliti).
  const fdByDate = new Map<string, number>();
  const monthForecastTotal = new Map<string, number>();
  for (const r of fdRows) {
    const iso = isoDay(new Date(r.d));
    const mk = `${r.year}-${String(r.month).padStart(2, "0")}`;
    fdByDate.set(iso, Number(r.v));
    monthForecastTotal.set(mk, (monthForecastTotal.get(mk) ?? 0) + Number(r.v));
  }

  const days: GroupPlanDayRow[] = [];
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += dayMs) {
    const cur = new Date(t);
    const iso = isoDay(cur);
    const year = cur.getUTCFullYear();
    const month1 = cur.getUTCMonth() + 1;
    const mk = `${year}-${String(month1).padStart(2, "0")}`;

    const gmPlan = monthGroupPlan.get(mk); // guruh → oylik reja
    const groupPlans: { groupId: number; groupName: string; plan: number }[] = [];

    if (gmPlan && gmPlan.size > 0) {
      const fdMonthTotal = monthForecastTotal.get(mk) ?? 0;
      if (fdMonthTotal > 0) {
        // ForecastDay shakli: kunlik_jami × (guruh_oy_reja / jami_oy_reja).
        // Ulush = shu kungi ForecastDay jami / oy bo'yicha ForecastDay jami.
        const dayTotal = fdByDate.get(iso) ?? 0;
        const dayShare = dayTotal / fdMonthTotal; // kun ulushi (oy ichida)
        for (const g of groups) {
          const monthly = gmPlan.get(g.id) ?? 0;
          groupPlans.push({ groupId: g.id, groupName: g.name, plan: monthly * dayShare });
        }
      } else {
        // Fallback: oylik rejani oy kunlariga teng taqsimla.
        const nDays = daysInMonthUTC(year, month1);
        for (const g of groups) {
          const monthly = gmPlan.get(g.id) ?? 0;
          groupPlans.push({ groupId: g.id, groupName: g.name, plan: nDays > 0 ? monthly / nDays : 0 });
        }
      }
    } else {
      // Bu oy uchun umuman reja yo'q — barcha guruhlar 0.
      for (const g of groups) {
        groupPlans.push({ groupId: g.id, groupName: groupName.get(g.id) ?? g.name, plan: 0 });
      }
    }

    const total = groupPlans.reduce((s, g) => s + g.plan, 0);
    days.push({ date: iso, total, groups: groupPlans });
  }

  return { days, groups };
}

// Keshsiz — guruh widgeti har doim fresh ma'lumot (Fakt bilan izchil).
export const dailyPlanByGroup = (range: DateRange, branchId?: number) =>
  _dailyPlanByGroup(range, branchId);
