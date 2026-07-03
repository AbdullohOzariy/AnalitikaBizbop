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
    const todayD = new Date(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
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
    const todayStr = todayD.toISOString().slice(0, 10);
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
    const futureCutoff = new Date(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
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
    const startStr = range.start.toISOString().slice(0, 10);
    const endStr = range.end.toISOString().slice(0, 10);
    const todayD = new Date(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
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

// Item + filial qatorlari uchun Prisma create payload (quantity = filiallar yig'indisi yoki jami).
function itemCreateData(i: z.infer<typeof itemSchema>) {
  const branchRows = normBranches(i.branches);
  const quantity = branchRows.length > 0 ? branchRows.reduce((s, b) => s + b.quantity, 0) : i.quantity;
  return {
    productId: i.productId, quantity, price: i.price,
    packCount: i.packCount ?? null, packSize: i.packSize ?? null,
    ...(branchRows.length > 0
      ? { branchQtys: { create: branchRows.map((b) => ({ branchId: b.branchId, quantity: b.quantity })) } }
      : {}),
  };
}

/** Pachka, narx va lead time'ni Product'da eslab qolamiz (keyingi zakazda tayyor). */
async function rememberOrderParams(
  items: { productId: number; packSize?: number | null; price: number; leadTimeDays?: number | null }[]
) {
  for (const i of items) {
    const data: { packSize?: number; purchasePrice?: number; leadTimeDays?: number } = {};
    if (i.packSize != null) data.packSize = i.packSize;
    if (i.price > 0) data.purchasePrice = i.price;
    if (i.leadTimeDays != null) data.leadTimeDays = i.leadTimeDays;
    if (Object.keys(data).length === 0) continue;
    await prisma.product.update({ where: { id: i.productId }, data }).catch(() => null);
  }
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
    const items = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").parse(input.items);
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
    const parsed = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").parse(items);
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
    // createMany nested yozolmaydi (filial qatorlari) — har item alohida create.
    // deleteMany filial qatorlarini ham (FK Cascade) o'chiradi, so'ng qayta yaratiladi.
    await prisma.$transaction([
      prisma.purchaseOrderItem.deleteMany({ where: { orderId: oid } }),
      ...parsed.map((i) => prisma.purchaseOrderItem.create({ data: { orderId: oid, ...itemCreateData(i) } })),
      prisma.purchaseOrder.update({ where: { id: oid }, data: { note: note?.trim() || null } }),
    ]);
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
