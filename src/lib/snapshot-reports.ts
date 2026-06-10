/**
 * OOS va Stockday hisobotlarining keshlangan so'rovlari.
 *
 * Sahifa fayllaridan lib'ga ko'chirilgan: (1) kesh isitish (warm.ts) ulardan
 * foydalanadi — fayl yuklangach birinchi tashrifchi og'ir hisobni kutmaydi;
 * (2) page.tsx faqat ko'rinishga javob beradi.
 *
 * Ma'lumot faqat fayl yuklanganda o'zgaradi — keshlar tag orqali invalidatsiya bo'ladi.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

export type SnapshotFilters = {
  startStr: string;
  endStr: string;
  branchId?: number;
  categoryId?: number;
  q: string;
};

const filterKey = (f: SnapshotFilters) =>
  [f.startStr, f.endStr, f.branchId ?? "all", f.categoryId ?? "all", f.q].join("|");

function innerWhere(f: SnapshotFilters): Prisma.Sql {
  const inner: Prisma.Sql[] = [
    Prisma.sql`ps."periodStart" >= ${f.startStr}::date`,
    Prisma.sql`ps."periodEnd" <= ${f.endStr}::date`,
  ];
  if (f.branchId) inner.push(Prisma.sql`ps."branchId" = ${f.branchId}`);
  if (f.categoryId) inner.push(Prisma.sql`p."categoryId" = ${f.categoryId}`);
  if (f.q) inner.push(Prisma.sql`(p.name ILIKE ${"%" + f.q + "%"} OR p.code::text = ${f.q})`);
  return Prisma.join(inner, " AND ");
}

// ─── OOS ───────────────────────────────────────────────────────────────────────

export type OosView = "oos" | "low" | "dead";

export type OosKpi = { jami: number; oos: number; low: number; dead: number; oos_amount: number };

export type OosRow = {
  productId: number; branchId: number;
  code: number; pname: string; bname: string; cname: string | null;
  stockQty: string | null; soldQty: string | null; amount: string; periodEnd: string | Date;
  abc: string | null; xyz: string | null; // matritsa holati — qator rangi uchun
};

// Eng so'nggi snapshot + davr agregati CTE'lari. "latest" — joriy holat (qoldiq),
// "agg" — davr bo'yicha jami sotuv va nechta yuklashda ko'ringani (o'lik qoldiq uchun).
// 731k qatorli ProductSales ustidan og'ir so'rov; keshlar tufayli faqat cache-miss'da yuradi.
function latestCte(f: SnapshotFilters): Prisma.Sql {
  return Prisma.sql`
    obase AS (
      SELECT ps."productId", ps."branchId", ps."stockQty", ps."soldQty", ps."amount",
             ps."periodStart", ps."periodEnd",
             p.code, p.name AS pname, p."categoryId", b.name AS bname,
             p."abcClass" AS abc, p."xyzClass" AS xyz
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      JOIN "Branch"  b ON b.id = ps."branchId"
      WHERE ${innerWhere(f)}
    ),
    latest AS (
      SELECT DISTINCT ON ("productId", "branchId")
             "productId", "branchId", "stockQty", "soldQty", "amount", "periodEnd",
             code, pname, "categoryId", bname, abc, xyz
      FROM obase
      ORDER BY "productId", "branchId", "periodEnd" DESC
    ),
    oagg AS (
      SELECT "productId", "branchId",
             COALESCE(SUM("soldQty"), 0) AS sold_total,
             COUNT(DISTINCT "periodStart") AS snaps
      FROM obase
      GROUP BY "productId", "branchId"
    )`;
}

const OOS_VIEW_COND: Record<OosView, Prisma.Sql> = {
  oos:  Prisma.sql`l."stockQty" IS NOT NULL AND l."stockQty" <= 0`,
  low:  Prisma.sql`l."stockQty" > 0 AND l."soldQty" IS NOT NULL AND l."soldQty" > 0 AND l."stockQty" < l."soldQty"`,
  // O'lik qoldiq: BUTUN davr davomida jami sotuv 0 + hozir qoldiq bor + kamida 2 ta
  // yuklashda ko'ringan (yangi kelgan partiya darhol "o'lik" tamg'asini olmasin).
  dead: Prisma.sql`l."stockQty" > 0 AND a.sold_total = 0 AND a.snaps >= 2`,
};

export const oosKpi = (f: SnapshotFilters) =>
  unstable_cache(
    async (): Promise<OosKpi> => {
      const res = await prisma.$queryRaw<OosKpi[]>(Prisma.sql`
        WITH ${latestCte(f)}
        SELECT
          count(*)::int AS jami,
          count(*) FILTER (WHERE ${OOS_VIEW_COND.oos})::int  AS oos,
          count(*) FILTER (WHERE ${OOS_VIEW_COND.low})::int  AS low,
          count(*) FILTER (WHERE ${OOS_VIEW_COND.dead})::int AS dead,
          COALESCE(SUM(l."amount") FILTER (WHERE ${OOS_VIEW_COND.oos}), 0)::float8 AS oos_amount
        FROM latest l
        JOIN oagg a ON a."productId" = l."productId" AND a."branchId" = l."branchId"
      `);
      return res[0] ?? { jami: 0, oos: 0, low: 0, dead: 0, oos_amount: 0 };
    },
    ["oosKpi_v2", filterKey(f)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export const oosRows = (f: SnapshotFilters, view: OosView, page: number, pageSize: number) =>
  unstable_cache(
    async (): Promise<OosRow[]> => {
      // O'lik qoldiqda savdo 0 — qoldiq miqdori bo'yicha saralaymiz (eng ko'p yotgani tepada)
      const orderRaw = view === "dead"
        ? Prisma.raw(`l."stockQty" DESC`)
        : Prisma.raw(`l."amount" DESC`);
      return prisma.$queryRaw<OosRow[]>(Prisma.sql`
        WITH ${latestCte(f)}
        SELECT l."productId", l."branchId", l.code, l.pname, l.bname, l."stockQty", l."soldQty", l."amount", l."periodEnd",
               l.abc, l.xyz, c.name AS cname
        FROM latest l
        JOIN oagg a ON a."productId" = l."productId" AND a."branchId" = l."branchId"
        LEFT JOIN "Category" c ON c.id = l."categoryId"
        WHERE ${OOS_VIEW_COND[view]}
        ORDER BY ${orderRaw}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `);
    },
    ["oosRows_v3", filterKey(f), view, String(page), String(pageSize)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

// ─── Stockday ──────────────────────────────────────────────────────────────────

export type StockView = "kritik" | "kam" | "normal" | "ortiqcha";

// Zaxira kunlari oraliqlari (Days of Supply): qoldiq ÷ o'rtacha kunlik sotuv
export const STOCK_CRITICAL = 3; // ≤ 3 kun  — zudlik bilan buyurtma
export const STOCK_LOW = 7;      // ≤ 7 kun  — tez orada buyurtma
export const STOCK_NORMAL = 30;  // ≤ 30 kun — yetarli; > 30 — ortiqcha

export type StockdayKpi = {
  faol: number; kritik: number; kam: number; normal: number; ortiqcha: number; ortiqcha_value: number;
  xavf: number; // kechikish xavfi: zaxira kunlari < yetib kelish kunlari
};

export type StockdayRow = {
  productId: number; branchId: number;
  code: number; pname: string; bname: string; cname: string | null;
  stockQty: string | null; avgDaily: string | null; stockDays: string | null; stockValue: string | null;
  periodEnd: string | Date;
  abc: string | null; xyz: string | null; // matritsa holati — qator rangi uchun
  arrivalDays: number | null; // keyingi zakaz kunigacha + lead time (lead kiritilmagan — null)
};

// Zaxira kunlari CTE — latest (qoldiq) + agg (davrdagi o'rtacha kunlik sotuv).
function sdCte(f: SnapshotFilters, todayDow: number): Prisma.Sql {
  return Prisma.sql`
    base AS (
      SELECT ps."productId", ps."branchId", ps."stockQty", ps."soldQty", ps."costAmount",
             ps."periodStart", ps."periodEnd",
             p.code, p.name AS pname, p."categoryId", b.name AS bname,
             p."abcClass" AS abc, p."xyzClass" AS xyz,
             p."leadTimeDays" AS lead, p."supplierId" AS supid
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      JOIN "Branch"  b ON b.id = ps."branchId"
      WHERE ${innerWhere(f)}
    ),
    latest AS (
      SELECT DISTINCT ON ("productId", "branchId")
             "productId", "branchId", "stockQty", "periodEnd", code, pname, "categoryId", bname, abc, xyz, lead, supid
      FROM base
      ORDER BY "productId", "branchId", "periodEnd" DESC
    ),
    agg AS (
      SELECT "productId", "branchId",
             COALESCE(SUM("soldQty"), 0) AS sold_total,
             COALESCE(SUM("costAmount"), 0) AS cost_total,
             COUNT(DISTINCT "periodStart") AS tracked_days
      FROM base
      GROUP BY "productId", "branchId"
    ),
    sd AS (
      SELECT l."productId", l."branchId", l.code, l.pname, l."categoryId", l.bname, l."periodEnd",
             l.abc, l.xyz, l.lead,
             -- Yetib kelish kunlari = keyingi zakaz kunigacha (ta'minotchi haftalik jadvalidan,
             -- belgilanmagan bo'lsa 0 — istalgan kuni) + SKU lead time. Lead kiritilmagan — NULL.
             CASE WHEN l.lead IS NOT NULL THEN
               COALESCE((
                 SELECT MIN((((wd - ${todayDow}) % 7) + 7) % 7)
                 FROM "Supplier" sup, unnest(sup."orderWeekdays") AS wd
                 WHERE sup.id = l.supid
               ), 0) + l.lead
             END AS arrival_days,
             l."stockQty",
             (a.sold_total / NULLIF(a.tracked_days, 0)) AS avg_daily,
             CASE
               WHEN l."stockQty" > 0 AND a.sold_total > 0 AND a.tracked_days > 0
               THEN l."stockQty" / (a.sold_total / a.tracked_days)
               ELSE NULL
             END AS stock_days,
             -- Muzlagan kapital: qoldiq × o'rtacha dona tannarxi (davr tannarxi ÷ sotilgan dona)
             CASE
               WHEN l."stockQty" > 0 AND a.sold_total > 0 AND a.cost_total > 0
               THEN l."stockQty" * (a.cost_total / a.sold_total)
               ELSE NULL
             END AS stock_value
      FROM latest l
      JOIN agg a ON a."productId" = l."productId" AND a."branchId" = l."branchId"
    )`;
}

const STOCK_VIEW_COND: Record<StockView, Prisma.Sql> = {
  kritik:   Prisma.sql`sd.stock_days IS NOT NULL AND sd.stock_days <= ${STOCK_CRITICAL}`,
  kam:      Prisma.sql`sd.stock_days > ${STOCK_CRITICAL} AND sd.stock_days <= ${STOCK_LOW}`,
  normal:   Prisma.sql`sd.stock_days > ${STOCK_LOW} AND sd.stock_days <= ${STOCK_NORMAL}`,
  ortiqcha: Prisma.sql`sd.stock_days > ${STOCK_NORMAL}`,
};

// todayStr — kechikish xavfi "bugun"ga bog'liq; kesh kalitiga kiradi (kunlik yangilanish)
export const stockdayKpi = (f: SnapshotFilters, todayStr: string) =>
  unstable_cache(
    async (): Promise<StockdayKpi> => {
      const todayDow = new Date(todayStr + "T00:00:00.000Z").getUTCDay();
      const res = await prisma.$queryRaw<StockdayKpi[]>(Prisma.sql`
        WITH ${sdCte(f, todayDow)}
        SELECT
          count(*) FILTER (WHERE sd.stock_days IS NOT NULL)::int AS faol,
          count(*) FILTER (WHERE ${STOCK_VIEW_COND.kritik})::int AS kritik,
          count(*) FILTER (WHERE ${STOCK_VIEW_COND.kam})::int AS kam,
          count(*) FILTER (WHERE ${STOCK_VIEW_COND.normal})::int AS normal,
          count(*) FILTER (WHERE ${STOCK_VIEW_COND.ortiqcha})::int AS ortiqcha,
          COALESCE(SUM(sd.stock_value) FILTER (WHERE ${STOCK_VIEW_COND.ortiqcha}), 0)::float8 AS ortiqcha_value,
          count(*) FILTER (WHERE sd.stock_days IS NOT NULL AND sd.arrival_days IS NOT NULL
                             AND sd.stock_days < sd.arrival_days)::int AS xavf
        FROM sd
      `);
      return res[0] ?? { faol: 0, kritik: 0, kam: 0, normal: 0, ortiqcha: 0, ortiqcha_value: 0, xavf: 0 };
    },
    ["stockdayKpi_v2", filterKey(f), todayStr],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export const stockdayRows = (f: SnapshotFilters, view: StockView, page: number, pageSize: number, todayStr: string) =>
  unstable_cache(
    async (): Promise<StockdayRow[]> => {
      const todayDow = new Date(todayStr + "T00:00:00.000Z").getUTCDay();
      // Kritik/Kam/Normal — eng tez tugaydigani yuqorida; Ortiqcha — eng ko'pi yuqorida
      const orderRaw = view === "ortiqcha"
        ? Prisma.raw(`sd.stock_days DESC`)
        : Prisma.raw(`sd.stock_days ASC`);
      return prisma.$queryRaw<StockdayRow[]>(Prisma.sql`
        WITH ${sdCte(f, todayDow)}
        SELECT sd."productId", sd."branchId", sd.code, sd.pname, sd.bname, sd."periodEnd",
               sd.abc, sd.xyz, sd.arrival_days::int AS "arrivalDays",
               sd."stockQty", sd.avg_daily AS "avgDaily", sd.stock_days AS "stockDays", sd.stock_value AS "stockValue",
               c.name AS cname
        FROM sd
        LEFT JOIN "Category" c ON c.id = sd."categoryId"
        WHERE ${STOCK_VIEW_COND[view]}
        ORDER BY ${orderRaw}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `);
    },
    ["stockdayRows_v3", filterKey(f), view, String(page), String(pageSize), todayStr],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();
