/**
 * Foyda (Iyerarxiya bo'yicha) — period kesimida.
 *
 *   foyda = (sotuv − tannarx) − chiqim
 *
 * Sotuv/tannarx: ProductSales (SKU → Product.categoryId = subkat), period proratsiyasi.
 * Chiqim: bizbop yozuvlari (ALOHIDA baza) → SpisaniyaCategoryLink (nom → subkat) orqali.
 * Subkat → kategoriya → bo'lim → umumiy bo'yicha yig'iladi.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { chiqimByKategoriya, type ChiqimRange } from "./db";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export type ProfitNode = {
  id: number;
  name: string;
  sales: number;
  cost: number;
  writeoff: number;
  gross: number; // sotuv − tannarx
  net: number; // gross − chiqim
  planMargin?: number | null; // reja marja % (faqat subkatlarda; filial tanlansa o'shaniki, aks holda filiallar o'rtachasi)
};
export type ProfitCat = ProfitNode & { subcats: ProfitNode[] };
export type ProfitGroup = ProfitNode & { cats: ProfitCat[] };
export type ProfitTree = {
  groups: ProfitGroup[];
  total: { sales: number; cost: number; writeoff: number; gross: number; net: number };
  unmappedWriteoff: number; // bog'lanmagan chiqim (foydaga kirmaydi)
};

function finalize<T extends { sales: number; cost: number; writeoff: number }>(n: T) {
  return { ...n, gross: n.sales - n.cost, net: n.sales - n.cost - n.writeoff };
}

async function _computeProfitTree(
  range: ChiqimRange,
  branchId?: number,
  branchName?: string
): Promise<ProfitTree> {
  const branchSql = branchId ? Prisma.sql`AND ps."branchId" = ${branchId}` : Prisma.empty;
  const [groups, salesRows, writeoffRows, links] = await Promise.all([
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            children: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
          },
        },
      },
    }),
    // Sotuv/tannarx — subkat (Product.categoryId) bo'yicha, period proratsiyasi.
    // Marja narxlardan (vaznli): sotuv=Σ(salePrice×soni), tannarx=Σ(costPrice×soni);
    // tayyor narx yo'q bo'lsa eski summalarga (amount/costAmount) fallback.
    prisma.$queryRaw<{ cid: number; sales: number; cost: number }[]>`
      SELECT p."categoryId" AS cid,
        SUM(COALESCE(ps."salePrice" * ps."soldQty", ps.amount)::numeric * frac.f)::float8 AS sales,
        SUM(COALESCE(ps."costPrice" * ps."soldQty", ps."costAmount", 0)::numeric * frac.f)::float8 AS cost
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      JOIN LATERAL (
        SELECT (
          (LEAST(ps."periodEnd", ${range.end}::date) - GREATEST(ps."periodStart", ${range.start}::date) + 1)::float8
          / NULLIF((ps."periodEnd" - ps."periodStart" + 1)::float8, 0)
        ) AS f
      ) frac ON true
      WHERE ps."periodStart" <= ${range.end}::date
        AND ps."periodEnd" >= ${range.start}::date
        AND p."categoryId" IS NOT NULL
        ${branchSql}
      GROUP BY p."categoryId"
    `,
    chiqimByKategoriya(range, branchName),
    prisma.spisaniyaCategoryLink.findMany({ select: { botName: true, categoryId: true } }),
  ]);

  // Chiqim → categoryId (xarita orqali)
  const linkByName = new Map(links.map((l) => [l.botName, l.categoryId]));
  const woByCid = new Map<number, number>();
  let unmappedWriteoff = 0;
  for (const w of writeoffRows) {
    const cid = linkByName.get(w.kategoriya);
    if (cid != null) woByCid.set(cid, (woByCid.get(cid) ?? 0) + w.summa);
    else unmappedWriteoff += w.summa;
  }

  const salesByCid = new Map<number, { sales: number; cost: number }>();
  for (const r of salesRows) salesByCid.set(Number(r.cid), { sales: Number(r.sales), cost: Number(r.cost) });

  // Subkat reja marjasi: filial tanlansa o'shaniki, aks holda filiallar reja %'ining o'rtachasi
  const planByCid = new Map<number, number>();
  if (branchId) {
    const rows = await prisma.marginPlan.findMany({ where: { branchId }, select: { categoryId: true, marginPct: true } });
    for (const r of rows) planByCid.set(r.categoryId, Number(r.marginPct));
  } else {
    const rows = await prisma.marginPlan.groupBy({ by: ["categoryId"], _avg: { marginPct: true } });
    for (const r of rows) if (r._avg.marginPct != null) planByCid.set(r.categoryId, Number(r._avg.marginPct));
  }

  let tS = 0, tC = 0, tW = 0;
  const outGroups: ProfitGroup[] = groups.map((g) => {
    let gS = 0, gC = 0, gW = 0;
    const cats: ProfitCat[] = g.categories.map((c) => {
      let cS = 0, cC = 0, cW = 0;
      const subcats: ProfitNode[] = c.children.map((s) => {
        const sv = salesByCid.get(s.id) ?? { sales: 0, cost: 0 };
        const wo = woByCid.get(s.id) ?? 0;
        cS += sv.sales; cC += sv.cost; cW += wo;
        return { ...finalize({ id: s.id, name: s.name, sales: sv.sales, cost: sv.cost, writeoff: wo }), planMargin: planByCid.get(s.id) ?? null };
      });
      // Kategoriyaning o'ziga (top-level cid) to'g'ridan-to'g'ri bog'langan chiqim/sotuv
      const catDirectWo = woByCid.get(c.id) ?? 0;
      const catDirectSv = salesByCid.get(c.id) ?? { sales: 0, cost: 0 };
      cS += catDirectSv.sales; cC += catDirectSv.cost; cW += catDirectWo;
      gS += cS; gC += cC; gW += cW;
      return { ...finalize({ id: c.id, name: c.name, sales: cS, cost: cC, writeoff: cW }), subcats };
    });
    tS += gS; tC += gC; tW += gW;
    return { ...finalize({ id: g.id, name: g.name, sales: gS, cost: gC, writeoff: gW }), cats };
  });

  return {
    groups: outGroups,
    total: { sales: tS, cost: tC, writeoff: tW, gross: tS - tC, net: tS - tC - tW },
    unmappedWriteoff,
  };
}

// Keshlangan (ANALYTICS_CACHE_TAG bilan) — reja/chiqim o'zgarganda invalidatsiya bo'ladi.
// 731k ProductSales bo'yicha og'ir so'rov har yuklashda emas, faqat cache miss'da bajariladi.
// DIQQAT: kesh kaliti branchId'ga asoslangan; branchName undan DB orqali olinadi va
// chiqimByKategoriya bizbop bazasida NOM bo'yicha filtrlaydi. Analitika'dagi filial nomi
// bizbop'dagi nom bilan aynan mos bo'lishi shart — farq bo'lsa chiqim 0 chiqadi va shu
// noto'g'ri natija keshda qoladi (Branch nomi o'zgartirilsa keshni ham invalidatsiya qiling).
export function computeProfitTree(range: ChiqimRange, branchId?: number): Promise<ProfitTree> {
  return unstable_cache(
    async () => {
      // Chiqim bizbop bazasida NOM bo'yicha filtrlanadi. Bog'langan bo'lsa chiqimFilial,
      // aks holda Branch.name (avvalgi xatti-harakat — mos kelsa ishlaydi, kelmasa 0).
      const branch = branchId
        ? await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, chiqimFilial: true } })
        : null;
      const branchName = branch ? (branch.chiqimFilial ?? branch.name) : undefined;
      return _computeProfitTree(range, branchId, branchName);
    },
    ["computeProfitTree_v3", isoDay(range.start), isoDay(range.end), branchId ? String(branchId) : "all"],
    // revalidate: false EMAS — chiqim komponenti bizbop (bot) bazasidan keladi va
    // u yerdagi yozuvlar revalidateTag chaqirmaydi; 5 daqiqalik yangilanish yetarli.
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 300 }
  )();
}
