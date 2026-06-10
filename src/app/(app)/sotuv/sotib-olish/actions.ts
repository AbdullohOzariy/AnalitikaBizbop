"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCatManagerOrAdmin } from "@/lib/auth-helpers";
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
};
export type SupplierOption = {
  id: number;
  name: string;
  skuCount: number;
  orderWeekdays: number[]; // zakaz qabul kunlari (0=Yak..6=Sha)
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
  lead: number | null; // lead time (kun) — ta'minotchi profilida kiritiladi
  arxiv: boolean; // no-aktiv (arxivlangan) — ro'yxatda belgisi bilan ko'rinadi
  dailyAvg: number; // kunlik o'rtacha sotuv (oxirgi ma'lumot oynasi, filiallar yig'indisi)
  packSize: number | null; // blok/pachkadagi dona soni (Product'da eslab qolinadi)
  purchasePrice: number | null; // oxirgi kelishilgan dona narxi (eslab qolinadi)
  minStock: number | null; // kunlik × (zakaz oralig'i + lead) × XYZ buferi; lead yo'q — null
};

// Zakaz kunlari orasidagi MAKSIMAL interval (eng yomon stsenariy himoyasi).
// Bo'sh — istalgan kuni zakaz (1); bitta kun — haftada bir (7).
function maxOrderGapDays(weekdays: number[]): number {
  const uniq = [...new Set(weekdays)].sort((a, b) => a - b);
  if (uniq.length === 0) return 1;
  if (uniq.length === 1) return 7;
  let max = 0;
  for (let i = 0; i < uniq.length; i++) {
    const next = i + 1 === uniq.length ? uniq[0] + 7 : uniq[i + 1];
    max = Math.max(max, next - uniq[i]);
  }
  return max;
}

// Xavfsizlik buferi — talab notekisligi (XYZ) bo'yicha: notekisga ko'proq zaxira
const XYZ_BUFFER: Record<string, number> = { X: 1.1, Y: 1.25, Z: 1.5 };

/** Joriy foydalanuvchi qamrovidagi kategoriya id'lari (admin — barchasi = null). */
// Qamrov helperlari markazlashgan: src/lib/scope.ts

/** Zakaz uchun ta'minotchilar — foydalanuvchi qamrovidagi SKU'lari bor. */
export async function suppliersForOrderAction(): Promise<
  { ok: true; suppliers: SupplierOption[] } | { ok: false; error: string }
> {
  try {
    const user = await requireCatManagerOrAdmin();
    const scope = await scopeParentIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, suppliers: [] };
    const grouped = await prisma.product.groupBy({
      by: ["supplierId"],
      where: { supplierId: { not: null }, ...scopeProductWhere(scope) },
      _count: { _all: true },
    });
    const ids = grouped.map((g) => g.supplierId).filter((x): x is number => x != null);
    const sups = await prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, orderWeekdays: true } });
    const byId = new Map(sups.map((s) => [s.id, s]));
    const suppliers = grouped
      .filter((g) => g.supplierId != null)
      .map((g) => {
        const s = byId.get(g.supplierId!);
        return { id: g.supplierId!, name: s?.name ?? "—", skuCount: g._count._all, orderWeekdays: s?.orderWeekdays ?? [] };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "uz"));
    return { ok: true, suppliers };
  } catch (err) {
    return actionError(err, "suppliersForOrder");
  }
}

/** Ta'minotchi × qamrov SKU'lari + qoldiq/sotuv asosida taklif miqdori. */
export async function supplierItemsAction(
  supplierId: number
): Promise<{ ok: true; items: BuilderItem[] } | { ok: false; error: string }> {
  try {
    const user = await requireCatManagerOrAdmin();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    const scope = await scopeParentIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, items: [] };
    // Joriy holat Product'ga denormalizatsiya qilingan (har yuklashda yangilanadi) —
    // ProductSales tarixini skanlamaymiz, bir zumda o'qiymiz.
    const [products, supplier, range] = await Promise.all([
      prisma.product.findMany({
        where: { supplierId: sid, ...scopeProductWhere(scope) },
        select: { id: true, code: true, name: true, currentStock: true, currentSold: true, abcClass: true, xyzClass: true, leadTimeDays: true, archivedAt: true, packSize: true, purchasePrice: true, category: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: 2000,
      }),
      prisma.supplier.findUnique({ where: { id: sid }, select: { orderWeekdays: true } }),
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
    const orderGap = maxOrderGapDays(supplier?.orderWeekdays ?? []);

    const items: BuilderItem[] = products.map((p) => {
      const stock = Math.round(Number(p.currentStock ?? 0)); // so'nggi davr qoldig'i
      const sold = Math.round(Number(p.currentSold ?? 0)); // so'nggi davr sotuvi
      const dailyAvg = dailyByPid.get(p.id) ?? 0;
      // Min stock = kunlik × (zakaz oralig'i + lead) × XYZ buferi —
      // "bugun zakaz bermasangiz, keyingi imkoniyat + yetib kelish davrini qoplaydigan zaxira"
      const buffer = XYZ_BUFFER[p.xyzClass ?? ""] ?? 1.25;
      const minStock = p.leadTimeDays != null
        ? Math.ceil(dailyAvg * (orderGap + p.leadTimeDays) * buffer)
        : null;
      // Taklif: min stock'gacha to'ldirish; lead kiritilmagan — eski qo'pol formula
      const suggested = minStock != null
        ? Math.max(0, minStock - stock)
        : Math.max(0, sold - stock);
      return {
        productId: p.id, code: p.code, name: p.name, sub: p.category?.name ?? null,
        stock, sold, suggested, abc: p.abcClass, xyz: p.xyzClass, lead: p.leadTimeDays,
        arxiv: p.archivedAt != null, dailyAvg: Math.round(dailyAvg * 10) / 10, minStock,
        packSize: p.packSize,
        purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
      };
    });
    return { ok: true, items };
  } catch (err) {
    return actionError(err, "supplierItems");
  }
}

const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().max(1_000_000),
  price: z.coerce.number().nonnegative().max(1_000_000_000_000),
  packCount: z.coerce.number().int().positive().max(100_000).nullable().optional(),
  packSize: z.coerce.number().int().positive().max(100_000).nullable().optional(),
});

/** Pachka hajmi va kelishilgan narxni Product'da eslab qolamiz (keyingi zakazda tayyor). */
async function rememberOrderParams(
  items: { productId: number; packSize?: number | null; price: number }[]
) {
  for (const i of items) {
    const data: { packSize?: number; purchasePrice?: number } = {};
    if (i.packSize != null) data.packSize = i.packSize;
    if (i.price > 0) data.purchasePrice = i.price;
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
  items: OrderItemInput[];
  note?: string;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const user = await requireCatManagerOrAdmin();
    const supplierId = z.coerce.number().int().positive().parse(input.supplierId);
    const items = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").parse(input.items);
    const scopeErr = await scopeError(user, items.map((i) => i.productId));
    if (scopeErr) return { ok: false, error: scopeErr };
    const order = await prisma.purchaseOrder.create({
      data: {
        supplierId,
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
    const user = await requireCatManagerOrAdmin();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const parsed = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").parse(items);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { status: true, createdById: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (!ownsOrder(user, order.createdById)) return { ok: false, error: "Ruxsat yo'q." };
    if (order.status === "RECEIVED") return { ok: false, error: "Qabul qilingan zakazni tahrirlab bo'lmaydi." };
    const scopeErr = await scopeError(user, parsed.map((i) => i.productId));
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

const STATUS = ["DRAFT", "SENT", "RECEIVED", "RETURNED"] as const;

/** Zakaz holatini o'zgartiradi. */
export async function setOrderStatusAction(
  orderId: number,
  status: (typeof STATUS)[number]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireCatManagerOrAdmin();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const st = z.enum(STATUS).parse(status);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { createdById: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (!ownsOrder(user, order.createdById)) return { ok: false, error: "Ruxsat yo'q." };
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
    return { ok: true };
  } catch (err) {
    return actionError(err, "setOrderStatus");
  }
}

/** Zakazni o'chiradi (faqat qoralama). */
export async function deleteOrderAction(orderId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireCatManagerOrAdmin();
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
