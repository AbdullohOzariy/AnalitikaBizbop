"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrderCreator } from "@/lib/auth-helpers";
import { auth } from "@/auth";
import { ORDER_STATUSES, canTransition, canEditItems, canEnterFact, hisobMinStock, hisobMaxStock, type OrderStatusT } from "./order-status";
import { isSystemAdmin } from "@/lib/roles";
import { actionError } from "@/lib/action-error";
import { scopeParentIds, scopeProductWhere } from "@/lib/scope";
import { getDefaultRange } from "@/lib/analytics";
import { Prisma } from "@/generated/prisma/client";

export type OrderItemInput = {
  productId: number;
  quantity: number; // dona
  price: number; // dona narxi
  packCount?: number | null; // blok/yashik soni (kiritilgan bo'lsa)
  packSize?: number | null; // pachka hajmi (dona)
  leadTimeDays?: number | null; // zakaz berishda kiritilsa — SKU'da eslab qolinadi
};
export type AgentOption = {
  id: number;
  name: string;
  skuCount: number;
  nextOrderDate: string | null;
};
export type SupplierOption = {
  id: number;
  name: string;
  skuCount: number; // jami SKU (agentli + agentsiz)
  agentlessSkuCount: number; // agentga biriktirilmagan SKU soni ("Agentsiz" zakaz uchun)
  nextOrderDate: string | null; // supplier keyingi zakaz sanasi (YYYY-MM-DD) — hint
  agents: AgentOption[];
};
export type BuilderItem = {
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  stock: number;
  sold: number;
  suggested: number;
  abc: string | null; // ABC×XYZ matritsa holati — rang uchun
  xyz: string | null;
  lead: number | null; // lead time (kun) — yetkazib beruvchi profilida kiritiladi
  arxiv: boolean; // no-aktiv (arxivlangan) — ro'yxatda belgisi bilan ko'rinadi
  dailyAvg: number; // kunlik o'rtacha sotuv (oxirgi ma'lumot oynasi, filiallar yig'indisi)
  packSize: number | null; // blok/pachkadagi dona soni (Product'da eslab qolinadi)
  purchasePrice: number | null; // oxirgi kelishilgan dona narxi (eslab qolinadi)
  minStock: number | null; // kunlik × (zakaz oralig'i + lead) × XYZ buferi; lead yo'q — null
  maxStock: number | null; // kunlik × (2·zakaz oralig'i + lead) × XYZ buferi; to'ldirish darajasi
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
    const scope = await scopeParentIds(Number(user.id), user.role);
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
    const [sups, agentsRaw, supNextDays, agentNextDays] = await Promise.all([
      prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      agentIds.length
        ? prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, supplierId: true } })
        : Promise.resolve([] as { id: number; name: string; supplierId: number }[]),
      prisma.supplierOrderDay.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: ids }, sana: { gte: todayD } },
        _min: { sana: true },
      }),
      agentIds.length
        ? prisma.agentOrderDay.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, sana: { gte: todayD } }, _min: { sana: true } })
        : Promise.resolve([] as { agentId: number; _min: { sana: Date | null } }[]),
    ]);
    const supNextBy = new Map(supNextDays.map((r) => [r.supplierId, r._min.sana!.toISOString().slice(0, 10)]));
    const agentNextBy = new Map(agentNextDays.map((r) => [r.agentId, r._min.sana!.toISOString().slice(0, 10)]));
    const supName = new Map(sups.map((s) => [s.id, s.name]));

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
      arr.push({ id: a.id, name: a.name, skuCount: agentCount.get(a.id) ?? 0, nextOrderDate: agentNextBy.get(a.id) ?? null });
      agentsBySup.set(a.supplierId, arr);
    }
    const suppliers: SupplierOption[] = ids
      .map((sid) => ({
        id: sid,
        name: supName.get(sid) ?? "—",
        skuCount: supTotal.get(sid) ?? 0,
        agentlessSkuCount: supAgentless.get(sid) ?? 0,
        nextOrderDate: supNextBy.get(sid) ?? null,
        agents: (agentsBySup.get(sid) ?? []).sort((a, b) => a.name.localeCompare(b.name, "uz")),
      }))
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
): Promise<{ ok: true; items: BuilderItem[]; orderGap: number } | { ok: false; error: string }> {
  try {
    const user = await requireOrderCreator();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    // agentId berilsa — faqat shu agent SKU'lari; berilmasa — agentsiz (biriktirilmagan) SKU'lar
    const aid = agentId != null ? z.coerce.number().int().positive().parse(agentId) : null;
    const scope = await scopeParentIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, items: [], orderGap: 1 };
    // Joriy holat Product'ga denormalizatsiya qilingan (har yuklashda yangilanadi) —
    // ProductSales tarixini skanlamaymiz, bir zumda o'qiymiz.
    // Zakaz oralig'i (orderGap) manbai: agent bo'lsa AgentOrderDay, aks holda SupplierOrderDay.
    const futureCutoff = new Date(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
    const futureDaysPromise = aid != null
      ? prisma.agentOrderDay.findMany({ where: { agentId: aid, sana: { gte: futureCutoff } }, orderBy: { sana: "asc" }, take: 6, select: { sana: true } })
      : prisma.supplierOrderDay.findMany({ where: { supplierId: sid, sana: { gte: futureCutoff } }, orderBy: { sana: "asc" }, take: 6, select: { sana: true } });
    const [products, futureOrderDays, range] = await Promise.all([
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
    ]);

    // Kunlik o'rtacha sotuv — oxirgi ma'lumot oynasida (filiallar yig'indisi),
    // Stockday "Sotuv/kun" bilan bir xil hisob: jami sotilgan ÷ ma'lumotli kunlar.
    const pids = products.map((p) => p.id);
    const dailyRows = pids.length
      ? await prisma.$queryRaw<{ pid: number; sold: number; days: number }[]>(Prisma.sql`
          SELECT ps."productId" AS pid,
                 COALESCE(SUM(ps."soldQty"), 0)::float8 AS sold,
                 COUNT(DISTINCT ps."periodStart")::int AS days
          FROM "ProductSales" ps
          WHERE ps."productId" = ANY(${pids}::int[])
            AND ps."periodStart" >= ${range.start.toISOString().slice(0, 10)}::date
            AND ps."periodEnd" <= ${range.end.toISOString().slice(0, 10)}::date
          GROUP BY 1
        `)
      : [];
    const dailyByPid = new Map(dailyRows.map((r) => [r.pid, r.days > 0 ? r.sold / r.days : 0]));
    // eslint-disable-next-line react-hooks/purity -- server action
    const todayD = new Date(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
    const orderGap = orderGapFromDates(futureOrderDays.map((d) => d.sana), todayD);

    const items: BuilderItem[] = products.map((p) => {
      const stock = Math.round(Number(p.currentStock ?? 0)); // so'nggi davr qoldig'i
      const sold = Math.round(Number(p.currentSold ?? 0)); // so'nggi davr sotuvi
      const dailyAvg = dailyByPid.get(p.id) ?? 0;
      // Min stock = kunlik × (zakaz oralig'i + lead) × XYZ buferi —
      // "bugun zakaz bermasangiz, keyingi imkoniyat + yetib kelish davrini qoplaydigan zaxira"
      const minStock = hisobMinStock(dailyAvg, orderGap, p.leadTimeDays, p.xyzClass);
      const maxStock = hisobMaxStock(dailyAvg, orderGap, p.leadTimeDays, p.xyzClass);
      // Taklif: qoldiq min'dan past bo'lsa — MAX gacha to'ldirish (order-up-to); lead yo'q — eski qo'pol formula
      const suggested = minStock != null
        ? (stock < minStock ? Math.max(0, (maxStock ?? minStock) - stock) : 0)
        : Math.max(0, sold - stock);
      // Iyerarxiya: leaf = product.category. parentId bo'lsa — leaf subkategoriya, otasi kategoriya;
      // aks holda leaf to'g'ridan kategoriya (sub yo'q). Guruh leaf yoki ota orqali.
      const c = p.category;
      const isSub = !!(c?.parentId && c.parent);
      const g = c ? (c.group ?? c.parent?.group ?? null) : null;
      return {
        productId: p.id, code: p.code, name: p.name, sub: c?.name ?? null,
        stock, sold, suggested, abc: p.abcClass, xyz: p.xyzClass, lead: p.leadTimeDays,
        arxiv: p.archivedAt != null, dailyAvg: Math.round(dailyAvg * 10) / 10, minStock, maxStock,
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
    return { ok: true, items, orderGap };
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
});

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

type ActorUser = { id: string | number; role: string };

/** CAT_MANAGER faqat o'z zakaziga ta'sir qilsin — egalik (IDOR) tekshiruvi. */
function ownsOrder(user: ActorUser, createdById: number): boolean {
  return isSystemAdmin(user.role) || createdById === Number(user.id);
}

/** Mahsulotlar foydalanuvchi qamrovida (kategoriya menejeri scope) ekanini tekshiradi. */
async function scopeError(user: ActorUser, productIds: number[]): Promise<string | null> {
  const scope = await scopeParentIds(Number(user.id), user.role);
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
        items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity, price: i.price, packCount: i.packCount ?? null, packSize: i.packSize ?? null })) },
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
    if (!canEditItems(user.role, order.status as OrderStatusT, isOwner)) {
      return { ok: false, error: "Bu bosqichda qatorlarni tahrirlash sizga ruxsat etilmagan." };
    }
    const scopeErr = user.role === "CAT_MANAGER"
      ? await scopeError({ id: user.id ?? 0, role: user.role ?? "" }, parsed.map((i) => i.productId))
      : null;
    if (scopeErr) return { ok: false, error: scopeErr };
    await prisma.$transaction([
      prisma.purchaseOrderItem.deleteMany({ where: { orderId: oid } }),
      prisma.purchaseOrderItem.createMany({ data: parsed.map((i) => ({ orderId: oid, productId: i.productId, quantity: i.quantity, price: i.price, packCount: i.packCount ?? null, packSize: i.packSize ?? null })) }),
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
    if (!canTransition(user.role, order.status as OrderStatusT, st, isOwner)) {
      return { ok: false, error: "Bu o'tish sizning rolingizga ruxsat etilmagan." };
    }
    await prisma.purchaseOrder.update({
      where: { id: oid },
      data: {
        status: st,
        sentAt: st === "SENT" ? new Date() : undefined,
        receivedAt: st === "RECEIVED" ? new Date() : undefined,
      },
    });
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
    if (user.role === "CAT_MANAGER" && order.createdById !== Number(user.id)) {
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
    if (!canEnterFact(user.role, order.status as OrderStatusT)) {
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
