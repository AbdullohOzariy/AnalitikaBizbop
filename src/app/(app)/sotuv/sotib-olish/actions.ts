"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCatManagerOrAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";

export type OrderItemInput = { productId: number; quantity: number; price: number };
export type SupplierOption = { id: number; name: string; skuCount: number };
export type BuilderItem = {
  productId: number;
  code: number;
  name: string;
  sub: string | null;
  stock: number;
  sold: number;
  suggested: number;
};

/** Joriy foydalanuvchi qamrovidagi kategoriya id'lari (ADMIN — barchasi = null). */
async function scopeCategoryIds(userId: number, role: string): Promise<number[] | null> {
  if (role === "ADMIN") return null;
  const rows = await prisma.categoryManager.findMany({ where: { userId }, select: { categoryId: true } });
  return rows.map((r) => r.categoryId);
}

/** Qamrovdagi mahsulot filtri (subkat'ning ota-kategoriyasi qamrovda). */
function scopeProductWhere(scope: number[] | null) {
  return scope === null ? {} : { category: { parentId: { in: scope } } };
}

/** Zakaz uchun ta'minotchilar — foydalanuvchi qamrovidagi SKU'lari bor. */
export async function suppliersForOrderAction(): Promise<
  { ok: true; suppliers: SupplierOption[] } | { ok: false; error: string }
> {
  try {
    const user = await requireCatManagerOrAdmin();
    const scope = await scopeCategoryIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, suppliers: [] };
    const grouped = await prisma.product.groupBy({
      by: ["supplierId"],
      where: { supplierId: { not: null }, ...scopeProductWhere(scope) },
      _count: { _all: true },
    });
    const ids = grouped.map((g) => g.supplierId).filter((x): x is number => x != null);
    const sups = await prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const byId = new Map(sups.map((s) => [s.id, s.name]));
    const suppliers = grouped
      .filter((g) => g.supplierId != null)
      .map((g) => ({ id: g.supplierId!, name: byId.get(g.supplierId!) ?? "—", skuCount: g._count._all }))
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
    const scope = await scopeCategoryIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, items: [] };
    const products = await prisma.product.findMany({
      where: { supplierId: sid, ...scopeProductWhere(scope) },
      select: { id: true, code: true, name: true, category: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 2000,
    });
    const pids = products.map((p) => p.id);
    const sums = pids.length
      ? await prisma.productSales.groupBy({
          by: ["productId"],
          where: { productId: { in: pids } },
          _sum: { stockQty: true, soldQty: true },
        })
      : [];
    const sumById = new Map(sums.map((s) => [s.productId, s]));
    const items: BuilderItem[] = products.map((p) => {
      const s = sumById.get(p.id);
      const stock = Number(s?._sum.stockQty ?? 0);
      const sold = Number(s?._sum.soldQty ?? 0);
      const suggested = Math.max(0, Math.round(sold - stock));
      return { productId: p.id, code: p.code, name: p.name, sub: p.category?.name ?? null, stock, sold, suggested };
    });
    return { ok: true, items };
  } catch (err) {
    return actionError(err, "supplierItems");
  }
}

const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().nonnegative(),
});

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
    const order = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        createdById: Number(user.id),
        note: input.note?.trim() || null,
        status: "DRAFT",
        items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity, price: i.price })) },
      },
      select: { id: true },
    });
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
    await requireCatManagerOrAdmin();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const parsed = z.array(itemSchema).min(1, "Kamida bitta mahsulot kerak").parse(items);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { status: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (order.status === "RECEIVED") return { ok: false, error: "Qabul qilingan zakazni tahrirlab bo'lmaydi." };
    await prisma.$transaction([
      prisma.purchaseOrderItem.deleteMany({ where: { orderId: oid } }),
      prisma.purchaseOrderItem.createMany({ data: parsed.map((i) => ({ orderId: oid, productId: i.productId, quantity: i.quantity, price: i.price })) }),
      prisma.purchaseOrder.update({ where: { id: oid }, data: { note: note?.trim() || null } }),
    ]);
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
    await requireCatManagerOrAdmin();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const st = z.enum(STATUS).parse(status);
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
    await requireCatManagerOrAdmin();
    const oid = z.coerce.number().int().positive().parse(orderId);
    const order = await prisma.purchaseOrder.findUnique({ where: { id: oid }, select: { status: true } });
    if (!order) return { ok: false, error: "Zakaz topilmadi." };
    if (order.status !== "DRAFT") return { ok: false, error: "Faqat qoralama zakazni o'chirish mumkin." };
    await prisma.purchaseOrder.delete({ where: { id: oid } });
    revalidatePath("/sotuv/sotib-olish");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteOrder");
  }
}
