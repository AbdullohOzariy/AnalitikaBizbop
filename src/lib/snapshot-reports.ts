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
  /** Kategoriya menejeri qamrovi — subkat id'lari (admin: undefined/null = cheklovsiz) */
  scopeSubIds?: number[] | null;
};

const filterKey = (f: SnapshotFilters) =>
  [
    f.startStr, f.endStr, f.branchId ?? "all", f.categoryId ?? "all", f.q,
    f.scopeSubIds ? `s${[...f.scopeSubIds].sort((a, b) => a - b).join(",")}` : "all",
  ].join("|");

function innerWhere(f: SnapshotFilters): Prisma.Sql {
  const inner: Prisma.Sql[] = [
    Prisma.sql`ps."periodStart" >= ${f.startStr}::date`,
    Prisma.sql`ps."periodEnd" <= ${f.endStr}::date`,
    // Arxivlangan (no-aktiv) SKU monitoring ro'yxatlarida ko'rinmaydi
    Prisma.sql`p."archivedAt" IS NULL`,
  ];
  if (f.branchId) inner.push(Prisma.sql`ps."branchId" = ${f.branchId}`);
  if (f.categoryId) inner.push(Prisma.sql`p."categoryId" = ${f.categoryId}`);
  if (f.q) inner.push(Prisma.sql`(p.name ILIKE ${"%" + f.q + "%"} OR p.code::text = ${f.q})`);
  // Menejer qamrovi: faqat biriktirilgan kategoriyalarning subkat'lari
  if (f.scopeSubIds) inner.push(Prisma.sql`p."categoryId" = ANY(${f.scopeSubIds}::int[])`);
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

// ─── Inventarizatsiya muammoli tovarlari ────────────────────────────────────────
// Qoldiq ≤ 0 (0 yoki minus) LEKIN so'nggi snapshot'da sotuvi bor — "sotiladi-yu, yo'q"
// eng muammoli holat. Kunlik Telegram hisoboti uchun (keshsiz, trigger bo'yicha o'qiladi).

export type InventoryProblemRow = {
  code: number; pname: string; cname: string | null; bname: string;
  stockQty: string | null; soldQty: string | null;
};

export const inventoryProblemRows = (f: SnapshotFilters) =>
  prisma.$queryRaw<InventoryProblemRow[]>(Prisma.sql`
    WITH ${latestCte(f)}
    SELECT l.code, l.pname, c.name AS cname, l.bname, l."stockQty", l."soldQty"
    FROM latest l
    LEFT JOIN "Category" c ON c.id = l."categoryId"
    WHERE l."stockQty" IS NOT NULL AND l."stockQty" <= 0
      AND l."soldQty" IS NOT NULL AND l."soldQty" > 0
    ORDER BY l."soldQty" DESC
    LIMIT 10000
  `);

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
function sdCte(f: SnapshotFilters, todayStr: string): Prisma.Sql {
  return Prisma.sql`
    base AS (
      SELECT ps."productId", ps."branchId", ps."stockQty", ps."soldQty", ps."costAmount",
             ps."periodStart", ps."periodEnd",
             p.code, p.name AS pname, p."categoryId", b.name AS bname,
             p."abcClass" AS abc, p."xyzClass" AS xyz,
             p."leadTimeDays" AS lead, p."supplierId" AS supid, p."agentId" AS agid
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      JOIN "Branch"  b ON b.id = ps."branchId"
      WHERE ${innerWhere(f)}
    ),
    latest AS (
      SELECT DISTINCT ON ("productId", "branchId")
             "productId", "branchId", "stockQty", "periodEnd", code, pname, "categoryId", bname, abc, xyz, lead, supid, agid
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
             -- Yetib kelish kunlari = keyingi zakaz kunigacha + SKU lead time.
             -- Keyingi zakaz kuni = eng yaqin ANIQ sana (OrderDay) YOKI DOIMIY hafta kuni
             -- (orderWeekdays: (wd - bugun_DOW + 7) % 7 kun ichida). Belgilanmagan — 0
             -- (istalgan kuni). Lead kiritilmagan — NULL.
             CASE WHEN l.lead IS NOT NULL THEN
               COALESCE(NULLIF(
                 CASE WHEN l.agid IS NOT NULL THEN LEAST(
                   COALESCE((SELECT MIN(aod.sana - ${todayStr}::date) FROM "AgentOrderDay" aod
                             WHERE aod."agentId" = l.agid AND aod.sana >= ${todayStr}::date), 99999),
                   COALESCE((SELECT MIN((wd - EXTRACT(DOW FROM ${todayStr}::date)::int + 7) % 7)
                             FROM "Agent" ag, unnest(ag."orderWeekdays") wd WHERE ag.id = l.agid), 99999)
                 ) ELSE LEAST(
                   COALESCE((SELECT MIN(od.sana - ${todayStr}::date) FROM "SupplierOrderDay" od
                             WHERE od."supplierId" = l.supid AND od.sana >= ${todayStr}::date), 99999),
                   COALESCE((SELECT MIN((wd - EXTRACT(DOW FROM ${todayStr}::date)::int + 7) % 7)
                             FROM "Supplier" s, unnest(s."orderWeekdays") wd WHERE s.id = l.supid), 99999)
                 ) END
               , 99999), 0) + l.lead
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
            const res = await prisma.$queryRaw<StockdayKpi[]>(Prisma.sql`
        WITH ${sdCte(f, todayStr)}
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
    ["stockdayKpi_v4", filterKey(f), todayStr],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export const stockdayRows = (f: SnapshotFilters, view: StockView, page: number, pageSize: number, todayStr: string) =>
  unstable_cache(
    async (): Promise<StockdayRow[]> => {
            // Kritik/Kam/Normal — eng tez tugaydigani yuqorida; Ortiqcha — eng ko'pi yuqorida
      const orderRaw = view === "ortiqcha"
        ? Prisma.raw(`sd.stock_days DESC`)
        : Prisma.raw(`sd.stock_days ASC`);
      return prisma.$queryRaw<StockdayRow[]>(Prisma.sql`
        WITH ${sdCte(f, todayStr)}
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
    ["stockdayRows_v5", filterKey(f), view, String(page), String(pageSize), todayStr],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

// ─── Iyerarxik daraxt agregatlari (Guruh → Kategoriya → Subkat) ────────────────
// OOS/Stockday daraxt ko'rinishi uchun: tugun darajasida soni + summa; SKU
// barglari subkat ochilganda alohida (leaf) action orqali lazy yuklanadi.

export type TreeAggRow = {
  gid: number; gname: string;
  cid: number; cname: string;
  sid: number; sname: string;
  cnt: number;   // SKU×filial qatorlari soni
  total: number; // OOS: savdo summasi; Stockday: muzlagan kapital (stock_value)
};

const TREE_GROUPING = Prisma.sql`
  COALESCE(g.id, -1)              AS gid,
  COALESCE(g.name, 'Moslanmagan') AS gname,
  COALESCE(par.id, -1)            AS cid,
  COALESCE(par.name, 'Moslanmagan') AS cname,
  COALESCE(sub.id, -1)            AS sid,
  COALESCE(sub.name, 'Moslanmagan') AS sname`;

export const oosTreeAgg = (f: SnapshotFilters, view: OosView) =>
  unstable_cache(
    async (): Promise<TreeAggRow[]> => {
      return prisma.$queryRaw<TreeAggRow[]>(Prisma.sql`
        WITH ${latestCte(f)}
        SELECT ${TREE_GROUPING},
               count(*)::int AS cnt,
               COALESCE(SUM(l."amount"), 0)::float8 AS total
        FROM latest l
        JOIN oagg a ON a."productId" = l."productId" AND a."branchId" = l."branchId"
        LEFT JOIN "Category" sub ON sub.id = l."categoryId"
        LEFT JOIN "Category" par ON par.id = sub."parentId"
        LEFT JOIN "CategoryGroup" g ON g.id = par."groupId"
        WHERE ${OOS_VIEW_COND[view]}
        GROUP BY 1, 2, 3, 4, 5, 6
      `);
    },
    ["oosTree_v1", filterKey(f), view],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

export const stockdayTreeAgg = (f: SnapshotFilters, view: StockView, todayStr: string) =>
  unstable_cache(
    async (): Promise<TreeAggRow[]> => {
            return prisma.$queryRaw<TreeAggRow[]>(Prisma.sql`
        WITH ${sdCte(f, todayStr)}
        SELECT ${TREE_GROUPING},
               count(*)::int AS cnt,
               COALESCE(SUM(sd.stock_value), 0)::float8 AS total
        FROM sd
        LEFT JOIN "Category" sub ON sub.id = sd."categoryId"
        LEFT JOIN "Category" par ON par.id = sub."parentId"
        LEFT JOIN "CategoryGroup" g ON g.id = par."groupId"
        WHERE ${STOCK_VIEW_COND[view]}
        GROUP BY 1, 2, 3, 4, 5, 6
      `);
    },
    ["stockdayTree_v3", filterKey(f), view, todayStr],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

// ─── Tekis agregatdan nested daraxt ────────────────────────────────────────────

export type SnapTreeSub = { id: number; name: string; cnt: number; total: number };
export type SnapTreeCat = { id: number; name: string; cnt: number; total: number; subs: SnapTreeSub[] };
export type SnapTreeGroup = { id: number; name: string; cnt: number; total: number; cats: SnapTreeCat[] };

export function buildSnapshotTree(rows: TreeAggRow[]): SnapTreeGroup[] {
  const groups = new Map<number, SnapTreeGroup>();
  const cats = new Map<string, SnapTreeCat>();
  for (const r of rows) {
    let g = groups.get(r.gid);
    if (!g) { g = { id: r.gid, name: r.gname, cnt: 0, total: 0, cats: [] }; groups.set(r.gid, g); }
    const ck = `${r.gid}_${r.cid}`;
    let c = cats.get(ck);
    if (!c) { c = { id: r.cid, name: r.cname, cnt: 0, total: 0, subs: [] }; cats.set(ck, c); g.cats.push(c); }
    c.subs.push({ id: r.sid, name: r.sname, cnt: r.cnt, total: r.total });
    c.cnt += r.cnt; c.total += r.total;
    g.cnt += r.cnt; g.total += r.total;
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.cats.sort((a, b) => b.total - a.total || b.cnt - a.cnt);
    for (const c of g.cats) c.subs.sort((a, b) => b.total - a.total || b.cnt - a.cnt);
  }
  out.sort((a, b) => b.total - a.total || b.cnt - a.cnt);
  return out;
}
