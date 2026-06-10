/**
 * ABC/XYZ tahlili — SKU darajasida, ProductSales davrlari bo'yicha.
 *
 * ABC: jami savdo summasiga kumulyativ ulush — A ≤ 80%, B ≤ 95%, C qolgani.
 * XYZ: talab barqarorligi — davrlar kesimida savdoning variatsiya koeffitsiyenti
 *      (CV = σ/μ). Mahsulot sotilmagan davr 0 deb hisoblanadi (aks holda "kamdan-kam,
 *      lekin bir xilda" sotiladigan tovar X bo'lib chiqardi). Davr = ProductSales
 *      yuklash davri (periodStart bo'yicha DISTINCT).
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

export type AbcClass = "A" | "B" | "C";
export type XyzClass = "X" | "Y" | "Z";

// ABC chegaralari — kumulyativ savdo ulushi
export const ABC_A_LIMIT = 0.8;
export const ABC_B_LIMIT = 0.95;
// XYZ chegaralari — variatsiya koeffitsiyenti (haftalik/davriy SKU savdosi uchun;
// klassik 0.1/0.25 SKU darajasida deyarli hammani Z qilib yuboradi)
export const XYZ_X_LIMIT = 0.25;
export const XYZ_Y_LIMIT = 0.5;

export type SkuAnaliz = {
  id: number;
  code: number;
  name: string;
  subId: number | null;
  subName: string | null;
  catId: number | null;
  catName: string | null;
  groupId: number | null;
  groupName: string | null;
  total: number; // davr bo'yicha savdo summasi
  qty: number;   // sotilgan dona
  share: number; // jami savdoga ulush (0..1)
  cum: number;   // kumulyativ ulush (0..1, savdo bo'yicha kamayish tartibida)
  cv: number;    // variatsiya koeffitsiyenti
  abc: AbcClass;
  xyz: XyzClass;
};

export type AbcXyzResult = {
  rows: SkuAnaliz[]; // savdo bo'yicha kamayish tartibida
  nPeriods: number;  // tanlangan oraliqdagi DISTINCT yuklash davrlari soni
  totalAmount: number;
};

type RawRow = {
  id: number;
  code: number;
  name: string;
  subId: number | null;
  subName: string | null;
  catId: number | null;
  catName: string | null;
  groupId: number | null;
  groupName: string | null;
  total: number;
  sumsq: number;
  qty: number;
};

async function _computeAbcXyz(
  startStr: string,
  endStr: string,
  branchId?: number
): Promise<AbcXyzResult> {
  const branchCond = branchId ? Prisma.sql`AND ps."branchId" = ${branchId}` : Prisma.empty;

  const [periodRes, raw] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT ps."periodStart")::int AS n
      FROM "ProductSales" ps
      WHERE ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date ${branchCond}
    `),
    prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH per AS (
        -- har mahsulot × davr: filiallar bo'yicha yig'ilgan savdo
        SELECT ps."productId" AS pid, ps."periodStart" AS p,
               COALESCE(SUM(ps.amount), 0)::float8       AS s,
               COALESCE(SUM(ps."soldQty"), 0)::float8    AS q
        FROM "ProductSales" ps
        WHERE ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date ${branchCond}
        GROUP BY 1, 2
      ),
      agg AS (
        SELECT pid, SUM(s) AS total, SUM(s * s) AS sumsq, SUM(q) AS qty
        FROM per GROUP BY pid
        HAVING SUM(s) > 0 -- savdosiz (faqat qoldiqli) SKU'lar OOS/o'lik-qoldiq hisobotiga tegishli
      )
      SELECT a.pid AS id, p.code, p.name,
             sub.id  AS "subId",  sub.name AS "subName",
             cat.id  AS "catId",  cat.name AS "catName",
             g.id    AS "groupId", g.name  AS "groupName",
             a.total::float8 AS total, a.sumsq::float8 AS sumsq, a.qty::float8 AS qty
      FROM agg a
      JOIN "Product" p ON p.id = a.pid
      LEFT JOIN "Category" sub ON sub.id = p."categoryId"
      LEFT JOIN "Category" cat ON cat.id = sub."parentId"
      LEFT JOIN "CategoryGroup" g ON g.id = cat."groupId"
      ORDER BY a.total DESC
    `),
  ]);

  const nPeriods = periodRes[0]?.n ?? 0;
  const totalAmount = raw.reduce((s, r) => s + r.total, 0);

  let cum = 0;
  const rows: SkuAnaliz[] = raw.map((r) => {
    const share = totalAmount > 0 ? r.total / totalAmount : 0;
    cum += share;
    const abc: AbcClass = cum <= ABC_A_LIMIT ? "A" : cum <= ABC_B_LIMIT ? "B" : "C";
    // Populyatsion dispersiya, sotilmagan davrlar 0 sifatida kiradi:
    // μ = Σs/N, σ² = Σs²/N − μ² (N — umumiy davrlar soni, mahsulotniki emas)
    const mean = nPeriods > 0 ? r.total / nPeriods : 0;
    const variance = nPeriods > 0 ? Math.max(0, r.sumsq / nPeriods - mean * mean) : 0;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    const xyz: XyzClass = cv <= XYZ_X_LIMIT ? "X" : cv <= XYZ_Y_LIMIT ? "Y" : "Z";
    return {
      id: r.id, code: r.code, name: r.name,
      subId: r.subId, subName: r.subName,
      catId: r.catId, catName: r.catName,
      groupId: r.groupId, groupName: r.groupName,
      total: r.total, qty: r.qty,
      share, cum, cv, abc, xyz,
    };
  });

  return { rows, nPeriods, totalAmount };
}

export function computeAbcXyz(
  startStr: string,
  endStr: string,
  branchId?: number
): Promise<AbcXyzResult> {
  return unstable_cache(
    () => _computeAbcXyz(startStr, endStr, branchId),
    ["abcXyz_v1", startStr, endStr, branchId ? String(branchId) : "all"],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();
}

// ─── Iyerarxik daraxt (Guruh → Kategoriya → Subkat → SKU) ──────────────────────

export type ClassCounts = { A: number; B: number; C: number; X: number; Y: number; Z: number };

export type AnalizSub = {
  id: number; name: string; total: number; share: number;
  counts: ClassCounts; skus: SkuAnaliz[];
};
export type AnalizCat = {
  id: number; name: string; total: number; share: number;
  counts: ClassCounts; subs: AnalizSub[];
};
export type AnalizGroup = {
  id: number; name: string; total: number; share: number;
  counts: ClassCounts; cats: AnalizCat[];
};

const emptyCounts = (): ClassCounts => ({ A: 0, B: 0, C: 0, X: 0, Y: 0, Z: 0 });

/** Tekis ro'yxatdan to'liq iyerarxik daraxt quradi (kategoriyasizlar — "Moslanmagan"). */
export function buildAnalizTree(result: AbcXyzResult): AnalizGroup[] {
  const groups = new Map<number, AnalizGroup>();
  const cats = new Map<string, AnalizCat>();
  const subs = new Map<string, AnalizSub>();

  for (const r of result.rows) {
    const gId = r.groupId ?? -1;
    const gName = r.groupName ?? "Moslanmagan";
    const cId = r.catId ?? -1;
    const cName = r.catName ?? "Moslanmagan";
    const sId = r.subId ?? -1;
    const sName = r.subName ?? "Moslanmagan";

    let g = groups.get(gId);
    if (!g) { g = { id: gId, name: gName, total: 0, share: 0, counts: emptyCounts(), cats: [] }; groups.set(gId, g); }
    const cKey = `${gId}_${cId}`;
    let c = cats.get(cKey);
    if (!c) { c = { id: cId, name: cName, total: 0, share: 0, counts: emptyCounts(), subs: [] }; cats.set(cKey, c); g.cats.push(c); }
    const sKey = `${cKey}_${sId}`;
    let s = subs.get(sKey);
    if (!s) { s = { id: sId, name: sName, total: 0, share: 0, counts: emptyCounts(), skus: [] }; subs.set(sKey, s); c.subs.push(s); }

    s.skus.push(r);
    for (const node of [g, c, s]) {
      node.total += r.total;
      node.counts[r.abc]++;
      node.counts[r.xyz]++;
    }
  }

  const t = result.totalAmount;
  const out = [...groups.values()];
  for (const g of out) {
    g.share = t > 0 ? g.total / t : 0;
    g.cats.sort((a, b) => b.total - a.total);
    for (const c of g.cats) {
      c.share = t > 0 ? c.total / t : 0;
      c.subs.sort((a, b) => b.total - a.total);
      for (const s of c.subs) {
        s.share = t > 0 ? s.total / t : 0;
        // skus allaqachon global savdo tartibida (rows sortlangan)
      }
    }
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

// ─── ABC×XYZ matritsa ──────────────────────────────────────────────────────────

export type MatrixCell = { count: number; total: number; share: number };
export type Matrix = Record<AbcClass, Record<XyzClass, MatrixCell>>;

export function buildMatrix(result: AbcXyzResult): Matrix {
  const m: Matrix = {
    A: { X: cell(), Y: cell(), Z: cell() },
    B: { X: cell(), Y: cell(), Z: cell() },
    C: { X: cell(), Y: cell(), Z: cell() },
  };
  for (const r of result.rows) {
    const c = m[r.abc][r.xyz];
    c.count++;
    c.total += r.total;
  }
  const t = result.totalAmount;
  for (const a of ["A", "B", "C"] as const)
    for (const x of ["X", "Y", "Z"] as const)
      m[a][x].share = t > 0 ? m[a][x].total / t : 0;
  return m;

  function cell(): MatrixCell {
    return { count: 0, total: 0, share: 0 };
  }
}
