"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrderCreator } from "@/lib/auth-helpers";
import { auth } from "@/auth";
import { ORDER_STATUSES, canTransition, canEditItems, canEnterFact, hisobMinStock, hisobMaxStock, type OrderStatusT } from "./order-status";
import { nextOrderDate } from "@/lib/order-days";
import { isSystemAdmin, ordersScopedToOwn } from "@/lib/roles";
import { actionError } from "@/lib/action-error";
import { scopeParentIds, scopeProductWhere } from "@/lib/scope";
import { getDefaultRange } from "@/lib/analytics";
import { todayTashkentISO, isoDay } from "@/lib/date";
import { decimalToNumber } from "@/lib/format";
import { Prisma } from "@/generated/prisma/client";

export type OrderItemInput = {
  productId: number;
  quantity: number; // dona (JAMI = filiallar yig'indisi)
  price: number; // dona narxi
  packCount?: number | null; // blok/yashik soni (kiritilgan bo'lsa)
  packSize?: number | null; // pachka hajmi (dona)
  leadTimeDays?: number | null; // zakaz berishda kiritilsa — SKU'da eslab qolinadi
  branches?: { branchId: number; quantity: number }[]; // filial taqsimoti (bo'sh = faqat jami)
};
export type AgentOption = {
  id: number;
  name: string;
  skuCount: number;
  nextOrderDate: string | null;
  avgRating: number | null; // yetib kelgan zakazlar o'rtacha bahosi (1..5)
  ratingCount: number;
};
export type SupplierOption = {
  id: number;
  name: string;
  skuCount: number; // jami SKU (agentli + agentsiz)
  agentlessSkuCount: number; // agentga biriktirilmagan SKU soni ("Agentsiz" zakaz uchun)
  nextOrderDate: string | null; // supplier keyingi zakaz sanasi (YYYY-MM-DD) — hint
  avgRating: number | null; // yetib kelgan zakazlar o'rtacha bahosi (1..5)
  ratingCount: number;
  agents: AgentOption[];
};
// Filial bo'yicha bitta katak — qoldiq/kunlik/avto-zakaz (builder ustun-guruhi).
export type BranchCell = {
  branchId: number;
  stock: number; // oxirgi snapshot qoldig'i (shu filial)
  dailyAvg: number; // kunlik o'rtacha sotuv (shu filial)
  suggested: number; // avto-zakaz (shu filial)
  minStock: number | null;
  maxStock: number | null;
};
// Zakaz builder ustunlari uchun filial ro'yxati (tartib = sortOrder).
export type BuilderBranch = { id: number; name: string };
export type BuilderItem = {
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  stock: number; // JAMI qoldiq (Σ filial)
  sold: number; // JAMI so'nggi davr sotuvi (Σ filial)
  suggested: number; // JAMI avto-zakaz (Σ filial)
  abc: string | null; // ABC×XYZ matritsa holati — rang uchun
  xyz: string | null;
  lead: number | null; // lead time (kun) — yetkazib beruvchi profilida kiritiladi
  arxiv: boolean; // no-aktiv (arxivlangan) — ro'yxatda belgisi bilan ko'rinadi
  dailyAvg: number; // JAMI kunlik o'rtacha sotuv (Σ filial)
  packSize: number | null; // blok/pachkadagi dona soni (Product'da eslab qolinadi)
  purchasePrice: number | null; // oxirgi kelishilgan dona narxi (eslab qolinadi)
  minStock: number | null; // JAMI min (Σ filial); lead yo'q — null
  maxStock: number | null; // JAMI max (Σ filial)
  branches: BranchCell[]; // filial bo'yicha taqsimot (tartib = BuilderBranch tartibi)
  // Iyerarxiya: guruh → kategoriya → subkategoriya (SKU shu yerga tegishli) — daraxt ko'rinishi uchun
  groupId: number | null; groupName: string | null; groupSort: number;
  catId: number | null; catName: string | null; catSort: number;
  subId: number | null; subName: string | null; subSort: number;
};

// Zakaz kunlari (aniq sanalar) orasidagi MAKSIMAL interval — eng yomon stsenariy.
// Belgilanmagan — istalgan kuni (1); bitta sana — ehtiyot uchun kamida 7.
function orderGapFromDates(dates: Date[], today: Date): number {
  if (dates.length === 0) return 1;
  const diff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
  let max = Math.max(0, diff(dates[0], today));
  for (let i = 1; i < dates.length; i++) max = Math.max(max, diff(dates[i], dates[i - 1]));
  if (dates.length === 1) max = Math.max(max, 7);
  return Math.max(1, max);
}



/** Joriy foydalanuvchi qamrovidagi kategoriya id'lari (admin — barchasi = null). */
// Qamrov helperlari markazlashgan: src/lib/scope.ts

/** Zakaz uchun yetkazib beruvchilar — foydalanuvchi qamrovidagi SKU'lari bor. */
export async function suppliersForOrderAction(): Promise<
  { ok: true; suppliers: SupplierOption[] } | { ok: false; error: string }
> {
  try {
    const user = await requireOrderCreator();
    const scope = await scopeParentIds(Number(user.id), user.roles);
    if (scope !== null && scope.length === 0) return { ok: true, suppliers: [] };
    // Supplier × agent bo'yicha SKU sonini bir so'rovda olamiz (agentsiz = agentId null)
    const grouped = await prisma.product.groupBy({
      by: ["supplierId", "agentId"],
      where: { supplierId: { not: null }, ...scopeProductWhere(scope) },
      _count: { _all: true },
    });
    const ids = [...new Set(grouped.map((g) => g.supplierId).filter((x): x is number => x != null))];
    if (ids.length === 0) return { ok: true, suppliers: [] };
    const agentIds = [...new Set(grouped.map((g) => g.agentId).filter((x): x is number => x != null))];
    const todayD = new Date(todayTashkentISO() + "T00:00:00.000Z");
    const [sups, agentsRaw, supNextDays, agentNextDays, supRatingRows, agentRatingRows] = await Promise.all([
      prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, orderWeekdays: true } }),
      agentIds.length
        ? prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, supplierId: true, orderWeekdays: true } })
        : Promise.resolve([] as { id: number; name: string; supplierId: number; orderWeekdays: number[] }[]),
      prisma.supplierOrderDay.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: ids }, sana: { gte: todayD } },
        _min: { sana: true },
      }),
      agentIds.length
        ? prisma.agentOrderDay.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, sana: { gte: todayD } }, _min: { sana: true } })
        : Promise.resolve([] as { agentId: number; _min: { sana: Date | null } }[]),
      // Yetib kelgan zakazlar o'rtacha bahosi — supplier va agent bo'yicha
      prisma.purchaseOrder.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: ids }, rating: { not: null } },
        _avg: { rating: true }, _count: { rating: true },
      }),
      agentIds.length
        ? prisma.purchaseOrder.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } })
        : Promise.resolve([] as { agentId: number | null; _avg: { rating: number | null }; _count: { rating: number } }[]),
    ]);
    const todayStr = isoDay(todayD);
    const supNextBy = new Map(supNextDays.map((r) => [r.supplierId, r._min.sana!.toISOString().slice(0, 10)]));
    const agentNextBy = new Map(agentNextDays.map((r) => [r.agentId, r._min.sana!.toISOString().slice(0, 10)]));
    // bahoni 1 kasrgacha yaxlitlaymiz
    const r1 = (n: number | null) => (n != null ? Math.round(n * 10) / 10 : null);
    const supRating = new Map(supRatingRows.map((r) => [r.supplierId, { avg: r1(r._avg.rating), count: r._count.rating }]));
    const agentRating = new Map(agentRatingRows.map((r) => [r.agentId!, { avg: r1(r._avg.rating), count: r._count.rating }]));
    const supWd = new Map(sups.map((s) => [s.id, s.orderWeekdays]));
    const agentWd = new Map(agentsRaw.map((a) => [a.id, a.orderWeekdays]));
    const supName = new Map(sups.map((s) => [s.id, s.name]));
    // Keyingi zakaz kuni = eng yaqin aniq sana yoki doimiy hafta kuni
    const supNext = (sid: number) => nextOrderDate(todayStr, supNextBy.get(sid) ? [supNextBy.get(sid)!] : [], supWd.get(sid) ?? []);
    const agentNext = (aid: number) => nextOrderDate(todayStr, agentNextBy.get(aid) ? [agentNextBy.get(aid)!] : [], agentWd.get(aid) ?? []);

    const agentCount = new Map<number, number>(); // agentId → SKU soni
    const supTotal = new Map<number, number>();
    const supAgentless = new Map<number, number>();
    for (const g of grouped) {
      const sid = g.supplierId!;
      supTotal.set(sid, (supTotal.get(sid) ?? 0) + g._count._all);
      if (g.agentId == null) supAgentless.set(sid, (supAgentless.get(sid) ?? 0) + g._count._all);
      else agentCount.set(g.agentId, (agentCount.get(g.agentId) ?? 0) + g._count._all);
    }
    const agentsBySup = new Map<number, AgentOption[]>();
    for (const a of agentsRaw) {
      const arr = agentsBySup.get(a.supplierId) ?? [];
      const ar = agentRating.get(a.id);
      arr.push({ id: a.id, name: a.name, skuCount: agentCount.get(a.id) ?? 0, nextOrderDate: agentNext(a.id), avgRating: ar?.avg ?? null, ratingCount: ar?.count ?? 0 });
      agentsBySup.set(a.supplierId, arr);
    }
    const suppliers: SupplierOption[] = ids
      .map((sid) => {
        const sr = supRating.get(sid);
        return {
          id: sid,
          name: supName.get(sid) ?? "—",
          skuCount: supTotal.get(sid) ?? 0,
          agentlessSkuCount: supAgentless.get(sid) ?? 0,
          nextOrderDate: supNext(sid),
          avgRating: sr?.avg ?? null,
          ratingCount: sr?.count ?? 0,
          agents: (agentsBySup.get(sid) ?? []).sort((a, b) => a.name.localeCompare(b.name, "uz")),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "uz"));
    return { ok: true, suppliers };
  } catch (err) {
    return actionError(err, "suppliersForOrder");
  }
}

/** Yetkazib beruvchi × qamrov SKU'lari + qoldiq/sotuv asosida taklif miqdori. */
export async function supplierItemsAction(
  supplierId: number,
  agentId?: number | null
): Promise<{ ok: true; items: BuilderItem[]; orderGap: number; branches: BuilderBranch[] } | { ok: false; error: string }> {
  try {
    const user = await requireOrderCreator();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    // agentId berilsa — faqat shu agent SKU'lari; berilmasa — agentsiz (biriktirilmagan) SKU'lar
    const aid = agentId != null ? z.coerce.number().int().positive().parse(agentId) : null;
    const scope = await scopeParentIds(Number(user.id), user.roles);
    if (scope !== null && scope.length === 0) return { ok: true, items: [], orderGap: 1, branches: [] };
    // Joriy holat Product'ga denormalizatsiya qilingan (har yuklashda yangilanadi) —
    // ProductSales tarixini skanlamaymiz, bir zumda o'qiymiz.
    // Zakaz oralig'i (orderGap) manbai: agent bo'lsa AgentOrderDay, aks holda SupplierOrderDay.
    const futureCutoff = new Date(todayTashkentISO() + "T00:00:00.000Z");
    const futureDaysPromise = aid != null
      ? prisma.agentOrderDay.findMany({ where: { agentId: aid, sana: { gte: futureCutoff } }, orderBy: { sana: "asc" }, take: 6, select: { sana: true } })
      : prisma.supplierOrderDay.findMany({ where: { supplierId: sid, sana: { gte: futureCutoff } }, orderBy: { sana: "asc" }, take: 6, select: { sana: true } });
    const [products, futureOrderDays, range, branchList] = await Promise.all([
      prisma.product.findMany({
        where: { supplierId: sid, ...(aid != null ? { agentId: aid } : { agentId: null }), ...scopeProductWhere(scope) },
        select: {
          id: true, code: true, name: true, currentStock: true, currentSold: true,
          abcClass: true, xyzClass: true, leadTimeDays: true, archivedAt: true, packSize: true, purchasePrice: true,
          category: {
            select: {
              id: true, name: true, sortOrder: true, parentId: true,
              group: { select: { id: true, name: true, sortOrder: true } },
              parent: { select: { id: true, name: true, sortOrder: true, group: { select: { id: true, name: true, sortOrder: true } } } },
            },
          },
        },
        orderBy: { name: "asc" },
        take: 2000,
      }),
      futureDaysPromise,
      getDefaultRange(),
      prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    ]);

    const pids = products.map((p) => p.id);
    const startStr = isoDay(range.start);
    const endStr = isoDay(range.end);
    const todayD = new Date(todayTashkentISO() + "T00:00:00.000Z");
    const orderGap = orderGapFromDates(futureOrderDays.map((d) => d.sana), todayD);

    // Filial bo'yicha (1) oxirgi snapshot qoldiq+sotuv (DISTINCT ON productId,branchId) va
    // (2) davr ichidagi kunlik o'rtacha. Distribution naqshi (lib/distribution.ts).
    const [snapRows, dailyRows] = pids.length
      ? await Promise.all([
          prisma.$queryRaw<{ pid: number; bid: number; stock: number; sold: number }[]>(Prisma.sql`
            SELECT DISTINCT ON (ps."productId", ps."branchId")
              ps."productId" AS pid, ps."branchId" AS bid,
              COALESCE(ps."stockQty", 0)::float8 AS stock, COALESCE(ps."soldQty", 0)::float8 AS sold
            FROM "ProductSales" ps
            WHERE ps."productId" = ANY(${pids}::int[])
            ORDER BY ps."productId", ps."branchId", ps."periodEnd" DESC
          `),
          prisma.$queryRaw<{ pid: number; bid: number; sold: number; days: number }[]>(Prisma.sql`
            SELECT ps."productId" AS pid, ps."branchId" AS bid,
                   COALESCE(SUM(ps."soldQty"), 0)::float8 AS sold,
                   COUNT(DISTINCT ps."periodStart")::int AS days
            FROM "ProductSales" ps
            WHERE ps."productId" = ANY(${pids}::int[])
              AND ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date
            GROUP BY 1, 2
          `),
        ])
      : [[], []];
    // pid → bid → {stock, sold}
    const snapByPid = new Map<number, Map<number, { stock: number; sold: number }>>();
    for (const r of snapRows) {
      let m = snapByPid.get(r.pid); if (!m) { m = new Map(); snapByPid.set(r.pid, m); }
      m.set(r.bid, { stock: r.stock, sold: r.sold });
    }
    // pid → bid → kunlik
    const dailyByPid = new Map<number, Map<number, number>>();
    for (const r of dailyRows) {
      let m = dailyByPid.get(r.pid); if (!m) { m = new Map(); dailyByPid.set(r.pid, m); }
      m.set(r.bid, r.days > 0 ? r.sold / r.days : 0);
    }

    const branches: BuilderBranch[] = branchList.map((b) => ({ id: b.id, name: b.name }));

    const items: BuilderItem[] = products.map((p) => {
      const snapM = snapByPid.get(p.id);
      const dailyM = dailyByPid.get(p.id);
      let totStock = 0, totSold = 0, totDaily = 0, totSug = 0, totMin = 0, totMax = 0;
      let anyMin = false, anyMax = false;
      // Har filial uchun qoldiq/kunlik/avto-zakaz — formula serverniki bilan bir xil (order-status.ts).
      const cells: BranchCell[] = branchList.map((b) => {
        const snap = snapM?.get(b.id);
        const bStock = Math.round(snap?.stock ?? 0);
        const bSold = Math.round(snap?.sold ?? 0);
        // bDaily'ni BIR MARTA yaxlitlaymiz (1 kasr) — formula va displayda ayni qiymat,
        // client (branchAvto) qayta hisoblaganda server bilan to'liq mos kelsin.
        const bDaily = Math.round((dailyM?.get(b.id) ?? 0) * 10) / 10;
        const bMin = hisobMinStock(bDaily, orderGap, p.leadTimeDays, p.xyzClass);
        const bMax = hisobMaxStock(bDaily, orderGap, p.leadTimeDays, p.xyzClass);
        // Taklif: qoldiq min'dan past — MAX gacha to'ldirish; lead yo'q — eski qo'pol formula (sotuv−qoldiq)
        const bSug = bMin != null
          ? (bStock < bMin ? Math.max(0, (bMax ?? bMin) - bStock) : 0)
          : Math.max(0, bSold - bStock);
        totStock += bStock; totSold += bSold; totDaily += bDaily; totSug += bSug;
        if (bMin != null) { totMin += bMin; anyMin = true; }
        if (bMax != null) { totMax += bMax; anyMax = true; }
        return { branchId: b.id, stock: bStock, dailyAvg: bDaily, suggested: bSug, minStock: bMin, maxStock: bMax };
      });
      // Iyerarxiya: leaf = product.category. parentId bo'lsa — leaf subkategoriya, otasi kategoriya;
      // aks holda leaf to'g'ridan kategoriya (sub yo'q). Guruh leaf yoki ota orqali.
      const c = p.category;
      const isSub = !!(c?.parentId && c.parent);
      const g = c ? (c.group ?? c.parent?.group ?? null) : null;
      return {
        productId: p.id, code: p.code, name: p.name, sub: c?.name ?? null,
        stock: totStock, sold: totSold, suggested: totSug, abc: p.abcClass, xyz: p.xyzClass, lead: p.leadTimeDays,
        arxiv: p.archivedAt != null, dailyAvg: Math.round(totDaily * 10) / 10,
        minStock: anyMin ? totMin : null, maxStock: anyMax ? totMax : null,
        branches: cells,
        packSize: p.packSize != null ? Number(p.packSize) : null,
        purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
        groupId: g?.id ?? null, groupName: g?.name ?? null, groupSort: g?.sortOrder ?? 0,
        catId: isSub ? c!.parent!.id : (c?.id ?? null),
        catName: isSub ? c!.parent!.name : (c?.name ?? null),
        catSort: isSub ? c!.parent!.sortOrder : (c?.sortOrder ?? 0),
        subId: isSub ? c!.id : null,
        subName: isSub ? c!.name : null,
        subSort: isSub ? c!.sortOrder : 0,
      };
    });
    return { ok: true, items, orderGap, branches };
  } catch (err) {
    return actionError(err, "supplierItems");
  }
}

const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().max(1_000_000),
  price: z.coerce.number().nonnegative().max(1_000_000_000_000),
  packCount: z.coerce.number().positive().max(100_000).nullable().optional(),
  packSize: z.coerce.number().positive().max(100_000).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  // Filial taqsimoti — bo'sh/berilmagan = faqat jami (legacy). quantity = filiallar yig'indisi.
  branches: z.array(z.object({
    branchId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().positive().max(1_000_000),
  })).max(50).optional(),
});

// Filial qatorlarini normallashtirish: faqat musbat, bir xil branchId yig'iladi.
function normBranches(branches?: { branchId: number; quantity: number }[]): { branchId: number; quantity: number }[] {
  if (!branches?.length) return [];
  const m = new Map<number, number>();
  for (const b of branches) if (b.quantity > 0) m.set(b.branchId, (m.get(b.branchId) ?? 0) + b.quantity);
  return [...m.entries()].map(([branchId, quantity]) => ({ branchId, quantity }));
}

// Item scalar maydonlari (filial qatorlarisiz) — createMany uchun.
function itemScalarData(i: z.infer<typeof itemSchema>) {
  const branchRows = normBranches(i.branches);
  const quantity = branchRows.length > 0 ? branchRows.reduce((s, b) => s + b.quantity, 0) : i.quantity;
  return {
    productId: i.productId, quantity, price: i.price,
    packCount: i.packCount ?? null, packSize: i.packSize ?? null,
  };
}

// Item + filial qatorlari uchun Prisma nested-create payload (bitta purchaseOrder.create ichida).
function itemCreateData(i: z.infer<typeof itemSchema>) {
  const branchRows = normBranches(i.branches);
  return {
    ...itemScalarData(i),
    ...(branchRows.length > 0
      ? { branchQtys: { create: branchRows.map((b) => ({ branchId: b.branchId, quantity: b.quantity })) } }
      : {}),
  };
}

/** Pachka, narx va lead time'ni Product'da eslab qolamiz (keyingi zakazda tayyor). */
async function rememberOrderParams(
  items: { productId: number; packSize?: number | null; price: number; leadTimeDays?: number | null }[]
) {
  // Har SKU uchun berilgan maydon yoziladi, berilmagani (null) COALESCE bilan saqlanadi.
  // Bitta bulk UPDATE (ilgari har SKU'ga alohida so'rov — N+1 edi). Best-effort: xato yutiladi.
  const vals = items
    .map((i) => ({
      pid: i.productId,
      pack: i.packSize != null ? i.packSize : null,
      price: i.price > 0 ? i.price : null,
      lead: i.leadTimeDays != null ? i.leadTimeDays : null,
    }))
    .filter((v) => v.pack != null || v.price != null || v.lead != null);
  if (vals.length === 0) return;
  const rows = vals.map(
    (v) => Prisma.sql`(${v.pid}::int, ${v.pack}::numeric, ${v.price}::numeric, ${v.lead}::int)`
  );
  await prisma.$executeRaw`
    UPDATE "Product" p SET
      "packSize"      = COALESCE(v.pack, p."packSize"),
      "purchasePrice" = COALESCE(v.price, p."purchasePrice"),
      "leadTimeDays"  = COALESCE(v.lead, p."leadTimeDays")
    FROM (VALUES ${Prisma.join(rows)}) AS v(pid, pack, price, lead)
    WHERE p.id = v.pid
  `.catch((e) => console.warn("[rememberOrderParams]", e instanceof Error ? e.message : e));
}

type ActorUser = { id: string | number; roles: readonly string[] };

/** CAT_MANAGER faqat o'z zakaziga ta'sir qilsin — egalik (IDOR) tekshiruvi. */
function ownsOrder(user: ActorUser, createdById: number): boolean {
  return isSystemAdmin(user.roles) || createdById === Number(user.id);
}

/** Yuborilgan filial id'lari haqiqatda mavjudligini tekshiradi (FK xatosi o'rniga aniq xabar). */
async function invalidBranchError(items: { branches?: { branchId: number }[] }[]): Promise<string | null> {
  const ids = [...new Set(items.flatMap((i) => i.branches?.map((b) => b.branchId) ?? []))];
  if (ids.length === 0) return null;
  const found = await prisma.branch.count({ where: { id: { in: ids } } });
  return found === ids.length ? null : "Ba'zi filiallar topilmadi.";
}

/** Mahsulotlar foydalanuvchi qamrovida (kategoriya menejeri scope) ekanini tekshiradi. */
async function scopeError(user: ActorUser, productIds: number[]): Promise<string | null> {
  const scope = await scopeParentIds(Number(user.id), user.roles);
  if (scope === null) return null; // admin — barchasi
  const uniq = [...new Set(productIds)];
  if (uniq.length === 0) return null;
  const inScope = await prisma.product.count({ where: { id: { in: uniq }, ...scopeProductWhere(scope) } });
  return inScope === uniq.length ? null : "Qamrovingizdan tashqari SKU bor.";
}

/** Yangi zakaz (qoralama) yaratadi. Yaratilgan id'ni qaytaradi. */
export async function createOrderAction(input: {
  supplierId: number;
  agentId?: number | null;
  items: OrderItemInput[];
  note?: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const user = await requireOrderCreator();
    const supplierId = z.coerce.number().int().positive().parse(input.supplierId);
    const agentId = input.agentId != null ? z.coerce.number().int().positive().parse(input.agentId) : null;
    const items = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").max(2000, "Juda ko'p qator").parse(input.items);
    const scopeErr = await scopeError(user, items.map((i) => i.productId));
    if (scopeErr) return { ok: false, error: scopeErr };
    const branchErr = await invalidBranchError(items);
    if (branchErr) return { ok: false, error: branchErr };
    // Agent supplierga tegishlimi + barcha SKU shu agentniki (zakaz har agentga alohida)
    if (agentId != null) {
      const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { supplierId: true } });
      if (!agent || agent.supplierId !== supplierId) return { ok: false, error: "Agent bu yetkazib beruvchiga tegishli emas." };
      const mismatch = await prisma.product.count({ where: { id: { in: items.map((i) => i.productId) }, NOT: { agentId } } });
      if (mismatch > 0) return { ok: false, error: "Ba'zi SKU'lar tanlangan agentga tegishli emas." };
    }
    const order = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        agentId,
        createdById: Number(user.id),
        note: input.note?.trim() || null,
        status: "DRAFT",
        items: { create: items.map(itemCreateData) },
      },
      select: { id: true },
    });
    await rememberOrderParams(items);
    revalidatePath("/sotuv/sotib-olish");
    return { ok: true, id: order.id };
  } catch (err) {
    return actionError(err, "createOrder");
  }
}

/** Zakaz qatorlarini yangilaydi (yuborilgan zakazни ham tahrirlash mumkin). */
export async function updateOrderItemsAction(
  orderId: number,
  items: OrderItemInput[],
  note?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return { ok: false, error: "Ruxsat yo'q." };
    const oid = z.coerce.number().int().positive().parse(orderId);
    const parsed = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").max(2000, "Juda ko'p qator").parse(items);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { status: true, createdById: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    const isOwner = order.createdById === Number(user.id);
    if (!canEditItems(user.roles, order.status as OrderStatusT, isOwner)) {
      return { ok: false, error: "Bu bosqichda qatorlarni tahrirlash sizga ruxsat etilmagan." };
    }
    // scopeError o'zi cheklovsiz rollarda (scopeParentIds=null) hech narsa qaytarmaydi.
    const scopeErr = await scopeError(user, parsed.map((i) => i.productId));
    if (scopeErr) return { ok: false, error: scopeErr };
    const branchErr = await invalidBranchError(parsed);
    if (branchErr) return { ok: false, error: branchErr };
    // deleteMany filial qatorlarini ham (FK Cascade) o'chiradi, so'ng qayta yaratiladi.
    // N+1 o'rniga: itemlarni bitta createMany bilan, filial qatorlarini id round-trip'dan
    // keyin yana bitta createMany bilan yozamiz (300 SKU'da ~600 so'rov -> ~4 so'rovga tushadi).
    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: oid } });
      await tx.purchaseOrderItem.createMany({ data: parsed.map((i) => ({ orderId: oid, ...itemScalarData(i) })) });
      const branchInputs = parsed.filter((i) => normBranches(i.branches).length > 0);
      if (branchInputs.length > 0) {
        const created = await tx.purchaseOrderItem.findMany({
          where: { orderId: oid, productId: { in: branchInputs.map((i) => i.productId) } },
          select: { id: true, productId: true },
        });
        const idByProduct = new Map(created.map((c) => [c.productId, c.id]));
        const branchRows = branchInputs.flatMap((i) =>
          normBranches(i.branches).map((b) => ({ orderItemId: idByProduct.get(i.productId)!, branchId: b.branchId, quantity: b.quantity }))
        );
        if (branchRows.length > 0) await tx.purchaseOrderItemBranch.createMany({ data: branchRows });
      }
      await tx.purchaseOrder.update({ where: { id: oid }, data: { note: note?.trim() || null } });
    });
    await rememberOrderParams(parsed);
    revalidatePath(`/sotuv/sotib-olish/${oid}`);
    revalidatePath("/sotuv/sotib-olish");
    return { ok: true };
  } catch (err) {
    return actionError(err, "updateOrderItems");
  }
}

/** Zakaz holatini o'zgartiradi — rol-tranzitsiya matritsasi bilan (order-status.ts). */
export async function setOrderStatusAction(
  orderId: number,
  status: OrderStatusT
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return { ok: false, error: "Ruxsat yo'q." };
    const oid = z.coerce.number().int().positive().parse(orderId);
    const st = z.enum(ORDER_STATUSES).parse(status);
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: oid },
      select: { createdById: true, status: true },
    });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    const isOwner = order.createdById === Number(user.id);
    if (!canTransition(user.roles, order.status as OrderStatusT, st, isOwner)) {
      return { ok: false, error: "Bu o'tish sizning rolingizga ruxsat etilmagan." };
    }
    // TOCTOU himoyasi: statusni FAQAT hali biz o'qigan holatda bo'lsa o'zgartiramiz.
    // Ikki parallel so'rov (yoki eskirgan sahifa) matritsani chetlab o'tmasin — ikkinchisi
    // count=0 oladi va Telegram PDF ham ikki marta ketmaydi.
    const flip = await prisma.purchaseOrder.updateMany({
      where: { id: oid, status: order.status },
      data: {
        status: st,
        sentAt: st === "SENT" ? new Date() : undefined,
        receivedAt: st === "RECEIVED" ? new Date() : undefined,
      },
    });
    if (flip.count === 0) {
      return { ok: false, error: "Zakaz holati o'zgargan. Sahifani yangilang." };
    }
    revalidatePath(`/sotuv/sotib-olish/${oid}`);
    revalidatePath("/sotuv/sotib-olish");
    // "Zakaz qabul qilindi" (ACCEPTED) ga o'tganda nakladnoyni Telegram guruhga
    // avto-yuborish (sozlamada yoqilgan bo'lsa). Fire-and-forget — status o'zgarishi
    // yuborish natijasiga bog'liq emas (Railway doimiy server).
    if (st === "ACCEPTED") {
      void (async () => {
        try {
          const { getZakazPdfConfig } = await import("@/lib/zakaz-pdf/sozlama");
          if (!(await getZakazPdfConfig()).autoEnabled) return;
          const { sendZakazPdf } = await import("@/lib/zakaz-pdf/send");
          const r = await sendZakazPdf(oid);
          if (!r.ok) console.warn("[zakaz-pdf] avto yuborilmadi:", r.error);
          else console.log(`[zakaz-pdf] zakaz #${oid} avto yuborildi`);
        } catch (e) {
          console.error("[zakaz-pdf] avto xato:", e instanceof Error ? e.message : e);
        }
      })();
    }
    return { ok: true };
  } catch (err) {
    return actionError(err, "setOrderStatus");
  }
}

/** Zakaz nakladnoyini PDF qilib Telegram guruhga qo'lda yuboradi (qayta yuborish tugmasi). */
export async function sendZakazPdfAction(orderId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return { ok: false, error: "Ruxsat yo'q." };
    const oid = z.coerce.number().int().positive().parse(orderId);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { createdById: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (ordersScopedToOwn(user.roles) && order.createdById !== Number(user.id)) {
      return { ok: false, error: "Ruxsat yo'q." };
    }
    const { sendZakazPdf } = await import("@/lib/zakaz-pdf/send");
    return await sendZakazPdf(oid);
  } catch (err) {
    return actionError(err, "sendZakazPdf");
  }
}

/** Zakazni o'chiradi (faqat qoralama). */
export async function deleteOrderAction(orderId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireOrderCreator();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { status: true, createdById: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (!ownsOrder(user, order.createdById)) return { ok: false, error: "Ruxsat yo'q." };
    if (order.status !== "DRAFT") return { ok: false, error: "Faqat qoralama zakazni o'chirish mumkin." };
    await prisma.purchaseOrder.delete({ where: { id: oid } });
    revalidatePath("/sotuv/sotib-olish");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteOrder");
  }
}


const factSchema = z.array(
  z.object({
    productId: z.coerce.number().int().positive(),
    factQty: z.coerce.number().min(0).max(1_000_000).nullable(),
  })
).min(1);

/**
 * FAKT yetib kelgan miqdorlarni saqlash (buyurtma vs fakt solishtirish).
 * SUPPLYCHAIN / HEAD_CAT_MANAGER / Bo'lim boshlig'i / SYSTEM_ADMIN; faqat
 * ACCEPTED/RECEIVED bosqichlarida.
 */
export async function saveOrderFactAction(
  orderId: number,
  facts: { productId: number; factQty: number | null }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return { ok: false, error: "Ruxsat yo'q." };
    const oid = z.coerce.number().int().positive().parse(orderId);
    const parsed = factSchema.parse(facts);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { status: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (!canEnterFact(user.roles, order.status as OrderStatusT)) {
      return { ok: false, error: "Fakt kiritish faqat 'Zakaz qabul qilindi'/'Yetib keldi' bosqichida (supplychain/menejerlar boshi)." };
    }
    await prisma.$transaction(
      parsed.map((f) =>
        prisma.purchaseOrderItem.updateMany({
          where: { orderId: oid, productId: f.productId },
          data: { factQty: f.factQty },
        })
      )
    );
    revalidatePath(`/sotuv/sotib-olish/${oid}`);
    revalidatePath("/sotuv/sotib-olish");
    return { ok: true };
  } catch (err) {
    return actionError(err, "saveOrderFact");
  }
}

// ─── Yetib kelgan zakaz bahosi (1..5) — yetkazib beruvchi o'rtachasiga kiradi ────
const ratingSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Zakazga 5 ballik baho qo'yish — faqat ACCEPTED/RECEIVED bosqichida, fakt kiritish
 * huquqiga ega rollar (SUPPLYCHAIN / HEAD_CAT_MANAGER / ADMIN / SYSTEM_ADMIN).
 */
export async function saveOrderRatingAction(
  input: { orderId: number; rating: number; note?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user) return { ok: false, error: "Ruxsat yo'q." };
    const p = ratingSchema.parse(input);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: p.orderId }, select: { status: true, supplierId: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (!canEnterFact(user.roles, order.status as OrderStatusT)) {
      return { ok: false, error: "Baho faqat 'Zakaz qabul qilindi'/'Yetib keldi' bosqichida qo'yiladi (supplychain/menejerlar boshi)." };
    }
    await prisma.purchaseOrder.update({
      where: { id: p.orderId },
      data: { rating: p.rating, ratingNote: p.note?.trim() || null, ratedAt: new Date() },
    });
    revalidatePath(`/sotuv/sotib-olish/${p.orderId}`);
    revalidatePath("/sotuv/sotib-olish");
    revalidatePath(`/baza/taminotchilar/${order.supplierId}`); // o'rtacha baho KPI'sini yangilash
    return { ok: true };
  } catch (err) {
    return actionError(err, "saveOrderRating");
  }
}

// ─── Qayta zakaz (reorder): eski zakaz tarixi + "urug'lik" ma'lumot ───────────
// Oqim: postavshik tanlandi → tarixdan eski zakaz tanlanadi → reorderSourceAction
// uni builder uchun seed'ga aylantiradi. NARX ko'chirilmaydi — builder joriy narxni
// supplierItemsAction'dan oladi (purchasePrice), faqat miqdor + filial taqsimoti ko'chadi.

/** Postavshik zakazlar tarixining bitta qatori (qayta zakaz oynasi ro'yxati). */
export type SupplierOrderHistoryRow = {
  id: number;
  createdAt: Date;
  status: OrderStatusT;
  agentId: number | null;
  agentName: string | null; // agentsiz zakazda null
  itemCount: number; // zakazdagi SKU qatorlari soni
  totalSum: number; // Σ(miqdor × narx) — o'sha paytdagi narxlarda
  createdByName: string;
};

const historyOptsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/**
 * Bitta yetkazib beruvchining zakazlar tarixi (yangi → eski).
 * ordersScopedToOwn rollarida faqat foydalanuvchining O'Z zakazlari ko'rinadi.
 */
export async function supplierOrderHistoryAction(
  supplierId: number,
  opts?: { limit?: number }
): Promise<{ ok: true; orders: SupplierOrderHistoryRow[] } | { ok: false; error: string }> {
  try {
    const user = await requireOrderCreator();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    const { limit } = historyOptsSchema.parse(opts ?? {});
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        supplierId: sid,
        ...(ordersScopedToOwn(user.roles) ? { createdById: Number(user.id) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        status: true,
        agentId: true,
        agent: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (orders.length === 0) return { ok: true, orders: [] };
    // Qator soni va jami summa — DB'da agregatsiya (N+1 ham, minglab item qatorini
    // tortib olish ham yo'q). Σ(quantity×price) numeric qoladi → decimalToNumber.
    const ids = orders.map((o) => o.id);
    const aggRows = await prisma.$queryRaw<{ orderId: number; cnt: number; total: unknown }[]>(Prisma.sql`
      SELECT i."orderId" AS "orderId",
             COUNT(*)::int AS cnt,
             COALESCE(SUM(i.quantity * i.price), 0) AS total
      FROM "PurchaseOrderItem" i
      WHERE i."orderId" = ANY(${ids}::int[])
      GROUP BY i."orderId"
    `);
    const aggBy = new Map(aggRows.map((r) => [r.orderId, { cnt: r.cnt, total: decimalToNumber(r.total) }]));
    return {
      ok: true,
      orders: orders.map((o) => {
        const agg = aggBy.get(o.id);
        return {
          id: o.id,
          createdAt: o.createdAt,
          status: o.status as OrderStatusT,
          agentId: o.agentId,
          agentName: o.agent?.name ?? null,
          itemCount: agg?.cnt ?? 0,
          totalSum: agg?.total ?? 0,
          createdByName: o.createdBy.name,
        };
      }),
    };
  } catch (err) {
    return actionError(err, "supplierOrderHistory");
  }
}

/** Builder'ga uzatiladigan bitta qator (narxsiz — narx joriy holatdan olinadi). */
export type ReorderSeedItem = {
  productId: number;
  quantity: number; // JAMI (filiallar bo'lsa — ularning yig'indisi)
  branches: { branchId: number; quantity: number }[]; // bo'sh = taqsimotsiz (faqat jami)
};
/** Eski zakazdan olingan "urug'lik" ma'lumot + foydalanuvchiga ogohlantirishlar. */
export type ReorderSource = {
  supplierId: number;
  agentId: number | null;
  items: ReorderSeedItem[];
  warnings: string[];
};

/** Ogohlantirishda nomlarni sanab beradi: 5 tagacha, qolgani "+N ta". */
function namesHint(names: string[]): string {
  const head = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${head} +${names.length - 5} ta` : head;
}

/**
 * Eski zakazni yangi builder uchun seed'ga aylantiradi (qayta zakaz).
 *
 * Ko'chiriladi: SKU + miqdor + filial taqsimoti. Ko'chirilmaydi: NARX (builder
 * joriy purchasePrice'ni oladi). Bugun yaroqsiz bo'lib qolgan qatorlar (o'chirilgan/
 * arxivlangan SKU, boshqa postavshik/agentga o'tgan, qamrovdan tashqari) XATO emas —
 * filtrlanadi va warnings'da tushuntiriladi.
 */
export async function reorderSourceAction(
  orderId: number
): Promise<{ ok: true; data: ReorderSource } | { ok: false; error: string }> {
  try {
    const user = await requireOrderCreator();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: oid },
      select: {
        supplierId: true,
        agentId: true,
        createdById: true,
        items: {
          orderBy: { productId: "asc" },
          select: {
            productId: true,
            quantity: true,
            branchQtys: { select: { branchId: true, quantity: true } },
          },
        },
      },
    });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (ordersScopedToOwn(user.roles) && order.createdById !== Number(user.id)) {
      return { ok: false, error: "Ruxsat yo'q." };
    }
    if (order.items.length === 0) return { ok: false, error: "Bu zakazda qator yo'q — qayta zakaz berib bo'lmaydi." };

    const pids = order.items.map((i) => i.productId);
    const scope = await scopeParentIds(Number(user.id), user.roles);
    const [products, inScopeRows, branchRows] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: pids } },
        select: { id: true, name: true, supplierId: true, agentId: true, archivedAt: true },
      }),
      // scopeError bilan AYNI qoida (scopeProductWhere), lekin xato emas — filtr.
      scope === null
        ? Promise.resolve(null)
        : prisma.product.findMany({ where: { id: { in: pids }, ...scopeProductWhere(scope) }, select: { id: true } }),
      prisma.branch.findMany({ select: { id: true } }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const inScope = inScopeRows === null ? null : new Set(inScopeRows.map((p) => p.id));
    const liveBranches = new Set(branchRows.map((b) => b.id));

    const gone: string[] = []; // SKU o'chirilgan (endi bazada yo'q)
    const archived: string[] = [];
    const wrongSupplier: string[] = [];
    const wrongAgent: string[] = [];
    const outOfScope: string[] = [];
    let droppedBranchRows = 0; // o'chirilgan filialga tegishli taqsimot qatorlari
    let hasBranchData = false; // ko'chirilgan qatorlarda taqsimot bormi

    const items: ReorderSeedItem[] = [];
    for (const it of order.items) {
      const p = productById.get(it.productId);
      if (!p) { gone.push(`#${it.productId}`); continue; }
      if (p.archivedAt != null) { archived.push(p.name); continue; }
      // Builder SKU'larni supplier×agent bo'yicha yuklaydi (supplierItemsAction) —
      // seed ham AYNI shu ro'yxatga tushishi shart, aks holda qator "osilib" qoladi.
      if (p.supplierId !== order.supplierId) { wrongSupplier.push(p.name); continue; }
      // Zakaz har agentga ALOHIDA (createOrderAction'dagi mismatch qoidasi):
      // agentli zakazda SKU shu agentniki, agentsizda — agentga biriktirilmagan bo'lishi kerak.
      if ((p.agentId ?? null) !== (order.agentId ?? null)) { wrongAgent.push(p.name); continue; }
      if (inScope !== null && !inScope.has(p.id)) { outOfScope.push(p.name); continue; }

      if (it.branchQtys.length > 0) hasBranchData = true;
      const branches = it.branchQtys
        .filter((b) => {
          const alive = liveBranches.has(b.branchId);
          if (!alive) droppedBranchRows++;
          return alive;
        })
        .map((b) => ({ branchId: b.branchId, quantity: decimalToNumber(b.quantity) }))
        .filter((b) => b.quantity > 0);
      // Invariant (itemScalarData bilan bir xil): taqsimot bo'lsa jami = filiallar yig'indisi.
      // Barcha filiallari yo'qolgan qatorda miqdor saqlanadi, builder uni "faqat jami" ko'rsatadi.
      const quantity = branches.length > 0
        ? branches.reduce((s, b) => s + b.quantity, 0)
        : decimalToNumber(it.quantity);
      if (quantity <= 0) continue;
      items.push({ productId: p.id, quantity, branches });
    }

    const warnings: string[] = [];
    if (gone.length) warnings.push(`${gone.length} ta SKU endi mavjud emas, tashlab ketildi (${namesHint(gone)}).`);
    if (archived.length) warnings.push(`${archived.length} ta SKU arxivlangan, tashlab ketildi (${namesHint(archived)}).`);
    if (wrongSupplier.length)
      warnings.push(`${wrongSupplier.length} ta SKU boshqa yetkazib beruvchiga o'tgan, tashlab ketildi (${namesHint(wrongSupplier)}).`);
    if (wrongAgent.length)
      warnings.push(`${wrongAgent.length} ta SKU agenti o'zgargan, tashlab ketildi (${namesHint(wrongAgent)}).`);
    if (outOfScope.length)
      warnings.push(`${outOfScope.length} ta SKU qamrovingizdan tashqarida, tashlab ketildi (${namesHint(outOfScope)}).`);
    if (droppedBranchRows > 0)
      warnings.push(`${droppedBranchRows} ta filial taqsimoti mavjud bo'lmagan filialga tegishli edi — olib tashlandi.`);
    if (items.length === 0) warnings.push("Bu zakazdan ko'chiriladigan SKU qolmadi — zakazni qo'lda tuzing.");
    else if (!hasBranchData)
      warnings.push("Bu zakazda filial taqsimoti yo'q — miqdorni filiallar bo'yicha o'zingiz taqsimlang.");

    return { ok: true, data: { supplierId: order.supplierId, agentId: order.agentId, items, warnings } };
  } catch (err) {
    return actionError(err, "reorderSource");
  }
}
