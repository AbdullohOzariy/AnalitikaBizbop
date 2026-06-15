"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { auth } from "@/auth";
import { canSeeSuppliers, canEditSuppliers } from "@/lib/roles";

// Yetkazib beruvchilar bo'limi guard'lari: ko'rish — admin darajasi + SUPPLYCHAIN;
// tahrir — SYSTEM_ADMIN + SUPPLYCHAIN (read-only ADMIN tahrir qila olmaydi).
async function requireSupplierViewer() {
  const session = await auth();
  if (!session?.user || !canSeeSuppliers(session.user.role)) throw new Error("Ruxsat yo'q");
  return session.user;
}
async function requireSupplierEditor() {
  const session = await auth();
  if (!session?.user || !canEditSuppliers(session.user.role)) throw new Error("Ruxsat yo'q");
  return session.user;
}
import { actionError } from "@/lib/action-error";

export type SupSub = { subId: number; subName: string; catName: string | null; group: string | null; count: number };
export type SupSku = { code: number; name: string };

/** Yetkazib beruvchi ostidagi subkategoriyalar (SKU soni bilan) — lazy. */
export async function supplierSubcatsAction(
  supplierId: number
): Promise<{ ok: true; subs: SupSub[] } | { ok: false; error: string }> {
  try {
    await requireSupplierViewer();
    const id = z.coerce.number().int().positive().parse(supplierId);
    const grouped = await prisma.product.groupBy({
      by: ["categoryId"],
      where: { supplierId: id, categoryId: { not: null } },
      _count: { _all: true },
    });
    const catIds = grouped.map((g) => g.categoryId).filter((x): x is number => x != null);
    const cats = await prisma.category.findMany({
      where: { id: { in: catIds } },
      select: { id: true, name: true, parent: { select: { name: true, group: { select: { name: true } } }, }, group: { select: { name: true } } },
    });
    const byId = new Map(cats.map((c) => [c.id, c]));
    const subs: SupSub[] = grouped.map((g) => {
      const c = byId.get(g.categoryId!);
      return {
        subId: g.categoryId!,
        subName: c?.name ?? "—",
        catName: c?.parent?.name ?? null,
        group: c?.group?.name ?? c?.parent?.group?.name ?? null,
        count: g._count._all,
      };
    }).sort((a, b) => b.count - a.count);
    return { ok: true, subs };
  } catch (err) {
    return actionError(err, "supplierSubcats");
  }
}

/** Yetkazib beruvchi × subkategoriya bo'yicha SKU ro'yxati — lazy. */
export async function supplierSkusAction(
  supplierId: number,
  subId: number
): Promise<{ ok: true; products: SupSku[]; total: number } | { ok: false; error: string }> {
  try {
    await requireSupplierViewer();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    const cid = z.coerce.number().int().positive().parse(subId);
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { supplierId: sid, categoryId: cid },
        select: { code: true, name: true },
        orderBy: { name: "asc" },
        take: 250,
      }),
      prisma.product.count({ where: { supplierId: sid, categoryId: cid } }),
    ]);
    return { ok: true, products, total };
  } catch (err) {
    return actionError(err, "supplierSkus");
  }
}

// ═══════════════════ Yetkazib beruvchi profili ═══════════════════

const SUPPLIERS_TAG = "suppliers";

type Result = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  contactName: z.string().trim().max(120).optional(),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  ratingNote: z.string().trim().max(500).optional(),
});

/** Profil maydonlari (kontakt + baho). undefined — tegilmaydi, bo'sh satr — tozalanadi. */
export async function updateSupplierProfileAction(
  input: z.input<typeof profileSchema>
): Promise<Result> {
  try {
    await requireSupplierEditor();
    const p = profileSchema.parse(input);
    if (p.name) {
      const taken = await prisma.supplier.findFirst({
        where: { name: p.name, id: { not: p.supplierId } },
        select: { id: true },
      });
      if (taken) return { ok: false, error: "Bu nomli yetkazib beruvchi allaqachon bor." };
    }
    await prisma.supplier.update({
      where: { id: p.supplierId },
      data: {
        ...(p.name ? { name: p.name } : {}),
        ...(p.phone !== undefined ? { phone: p.phone || null } : {}),
        ...(p.contactName !== undefined ? { contactName: p.contactName || null } : {}),
        ...(p.rating !== undefined ? { rating: p.rating } : {}),
        ...(p.ratingNote !== undefined ? { ratingNote: p.ratingNote || null } : {}),
      },
    });
    revalidateTag(SUPPLIERS_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${p.supplierId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err, "supplierProfile");
  }
}

const orderDaySchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  sana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Zakaz qabul kunini (aniq sana) belgilash/bekor qilish — kalendardan bittalab. */
export async function toggleOrderDateAction(
  input: z.input<typeof orderDaySchema>
): Promise<{ ok: true; belgilandi: boolean } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const p = orderDaySchema.parse(input);
    const sana = new Date(p.sana + "T00:00:00.000Z");
    const where = { supplierId_sana: { supplierId: p.supplierId, sana } };
    const existing = await prisma.supplierOrderDay.findUnique({ where, select: { id: true } });
    let belgilandi: boolean;
    if (existing) {
      await prisma.supplierOrderDay.delete({ where });
      belgilandi = false;
    } else {
      await prisma.supplierOrderDay.create({ data: { supplierId: p.supplierId, sana } });
      belgilandi = true;
    }
    revalidateTag(SUPPLIERS_TAG, "max");
    // Stockday "Keladi" hisobi zakaz kunlariga bog'liq — analitika keshini yangilaymiz
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${p.supplierId}`);
    return { ok: true, belgilandi };
  } catch (err) {
    return actionError(err, "toggleOrderDate");
  }
}

// ── Shartnomalar ──

export type ContractRow = {
  id: number;
  title: string;
  number: string | null;
  signedAt: string | null; // YYYY-MM-DD
  endDate: string | null;
  amount: number | null;
  url: string | null;
  note: string | null;
};

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

const contractSchema = z.object({
  id: z.coerce.number().int().positive().optional(), // bor — tahrirlash
  supplierId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, "Nomi kerak").max(200),
  number: z.string().trim().max(100).optional(),
  signedAt: dateStr,
  endDate: dateStr,
  amount: z.coerce.number().nonnegative().max(1e15).nullable().optional(),
  url: z.string().trim().url("Havola noto'g'ri").max(500).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional(),
});

export async function saveContractAction(
  input: z.input<typeof contractSchema>
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const p = contractSchema.parse(input);
    const data = {
      title: p.title,
      number: p.number || null,
      signedAt: p.signedAt ? new Date(p.signedAt + "T00:00:00.000Z") : null,
      endDate: p.endDate ? new Date(p.endDate + "T00:00:00.000Z") : null,
      amount: p.amount ?? null,
      url: p.url || null,
      note: p.note || null,
    };
    const saved = p.id
      ? await prisma.supplierContract.update({ where: { id: p.id }, data })
      : await prisma.supplierContract.create({ data: { ...data, supplierId: p.supplierId } });
    revalidatePath(`/baza/taminotchilar/${p.supplierId}`);
    return { ok: true, id: saved.id };
  } catch (err) {
    return actionError(err, "saveContract");
  }
}

export async function deleteContractAction(id: number): Promise<Result> {
  try {
    await requireSupplierEditor();
    const cid = z.coerce.number().int().positive().parse(id);
    const c = await prisma.supplierContract.delete({ where: { id: cid } });
    revalidatePath(`/baza/taminotchilar/${c.supplierId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteContract");
  }
}

// ── Lead time (SKU darajasida) ──

const leadTimeSchema = z.object({
  productId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(0).max(365).nullable(),
});

/** Bitta SKU lead time'i. days=null — tozalash. */
export async function setLeadTimeAction(
  input: z.input<typeof leadTimeSchema>
): Promise<Result> {
  try {
    await requireSupplierEditor();
    const p = leadTimeSchema.parse(input);
    await prisma.product.update({
      where: { id: p.productId },
      data: { leadTimeDays: p.days },
    });
    return { ok: true };
  } catch (err) {
    return actionError(err, "setLeadTime");
  }
}

const bulkLeadSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(0).max(365),
  subId: z.coerce.number().int().positive().optional(), // berilsa — faqat shu subkat
  onlyEmpty: z.boolean().optional(), // true — faqat kiritilmaganlarga
});

/** Bulk: yetkazib beruvchining barcha (yoki bitta subkat) SKU'lariga lead time. */
export async function bulkLeadTimeAction(
  input: z.input<typeof bulkLeadSchema>
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const p = bulkLeadSchema.parse(input);
    const res = await prisma.product.updateMany({
      where: {
        supplierId: p.supplierId,
        ...(p.subId ? { categoryId: p.subId } : {}),
        ...(p.onlyEmpty ? { leadTimeDays: null } : {}),
      },
      data: { leadTimeDays: p.days },
    });
    revalidatePath(`/baza/taminotchilar/${p.supplierId}`);
    return { ok: true, count: res.count };
  } catch (err) {
    return actionError(err, "bulkLeadTime");
  }
}


/** Yangi yetkazib beruvchi qo'shish (SUPPLYCHAIN/SYSTEM_ADMIN). */
export async function createSupplierAction(
  name: string
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const nm = z.string().trim().min(1, "Nom kiriting").max(200).parse(name);
    const exists = await prisma.supplier.findUnique({ where: { name: nm }, select: { id: true } });
    if (exists) return { ok: false, error: "Bu nomli yetkazib beruvchi allaqachon bor." };
    const sup = await prisma.supplier.create({ data: { name: nm } });
    revalidateTag(SUPPLIERS_TAG, "max");
    revalidatePath("/baza/taminotchilar");
    return { ok: true, id: sup.id };
  } catch (err) {
    return actionError(err, "createSupplier");
  }
}


const skuParamSchema = z.object({
  productId: z.coerce.number().int().positive(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  packSize: z.coerce.number().positive().max(100_000).nullable().optional(),
  purchasePrice: z.coerce.number().nonnegative().max(1_000_000_000_000).nullable().optional(),
});

/** SKU sotib olish parametrlari (lead time / pachka / narx) — qisman yangilash. */
export async function updateSkuPurchaseAction(
  input: z.input<typeof skuParamSchema>
): Promise<Result> {
  try {
    await requireSupplierEditor();
    const p = skuParamSchema.parse(input);
    const data: Record<string, unknown> = {};
    if (p.leadTimeDays !== undefined) data.leadTimeDays = p.leadTimeDays;
    if (p.packSize !== undefined) data.packSize = p.packSize;
    if (p.purchasePrice !== undefined) data.purchasePrice = p.purchasePrice;
    if (Object.keys(data).length === 0) return { ok: true };
    await prisma.product.update({ where: { id: p.productId }, data });
    return { ok: true };
  } catch (err) {
    return actionError(err, "updateSkuPurchase");
  }
}


// ── Agentlar (brend) ──
// Yetkazib beruvchi ichidagi agentlar. SKU'lar agentlarga taqsimlanadi; har agent
// o'z zakaz kunlari (AgentOrderDay) bilan. Zakaz har agentga alohida beriladi.

export type AgentRow = {
  id: number;
  name: string;
  phone: string | null;
  contactName: string | null;
  sortOrder: number;
  skuCount: number;
  orderDates: string[]; // YYYY-MM-DD — kalendar uchun
};

const agentCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Nom kiriting").max(200),
  phone: z.string().trim().max(50).optional(),
  contactName: z.string().trim().max(120).optional(),
});

/** Yangi agent qo'shish. Nom yetkazib beruvchi ichida unikal. */
export async function createAgentAction(
  input: z.input<typeof agentCreateSchema>
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const p = agentCreateSchema.parse(input);
    const exists = await prisma.agent.findFirst({
      where: { supplierId: p.supplierId, name: p.name },
      select: { id: true },
    });
    if (exists) return { ok: false, error: "Bu nomli agent allaqachon bor." };
    const agent = await prisma.agent.create({
      data: { supplierId: p.supplierId, name: p.name, phone: p.phone || null, contactName: p.contactName || null },
      select: { id: true },
    });
    revalidateTag(SUPPLIERS_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${p.supplierId}`);
    return { ok: true, id: agent.id };
  } catch (err) {
    return actionError(err, "createAgent");
  }
}

const agentUpdateSchema = z.object({
  agentId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  contactName: z.string().trim().max(120).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

/** Agent profilini yangilash (qisman). undefined — tegilmaydi, bo'sh satr — tozalanadi. */
export async function updateAgentAction(input: z.input<typeof agentUpdateSchema>): Promise<Result> {
  try {
    await requireSupplierEditor();
    const p = agentUpdateSchema.parse(input);
    const agent = await prisma.agent.findUnique({ where: { id: p.agentId }, select: { supplierId: true } });
    if (!agent) return { ok: false, error: "Agent topilmadi." };
    if (p.name) {
      const taken = await prisma.agent.findFirst({
        where: { supplierId: agent.supplierId, name: p.name, id: { not: p.agentId } },
        select: { id: true },
      });
      if (taken) return { ok: false, error: "Bu nomli agent allaqachon bor." };
    }
    await prisma.agent.update({
      where: { id: p.agentId },
      data: {
        ...(p.name ? { name: p.name } : {}),
        ...(p.phone !== undefined ? { phone: p.phone || null } : {}),
        ...(p.contactName !== undefined ? { contactName: p.contactName || null } : {}),
        ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
      },
    });
    revalidateTag(SUPPLIERS_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${agent.supplierId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err, "updateAgent");
  }
}

/** Agentni o'chirish. Zakazi bo'lsa BLOKLANADI; SKU'lar yo'qolmaydi (agentId NULL). */
export async function deleteAgentAction(agentId: number): Promise<Result> {
  try {
    await requireSupplierEditor();
    const aid = z.coerce.number().int().positive().parse(agentId);
    const agent = await prisma.agent.findUnique({ where: { id: aid }, select: { supplierId: true } });
    if (!agent) return { ok: false, error: "Agent topilmadi." };
    const orderCount = await prisma.purchaseOrder.count({ where: { agentId: aid } });
    if (orderCount > 0) {
      return { ok: false, error: `O'chirib bo'lmaydi: ${orderCount} ta zakaz tarixi bor.` };
    }
    // SKU'lar agentsiz qoladi (SetNull) → supplier kunlariga qaytadi; AgentOrderDay cascade o'chadi
    await prisma.agent.delete({ where: { id: aid } });
    revalidateTag(SUPPLIERS_TAG, "max");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${agent.supplierId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteAgent");
  }
}

const agentOrderDaySchema = z.object({
  agentId: z.coerce.number().int().positive(),
  sana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Agent zakaz qabul kunini belgilash/bekor qilish — toggleOrderDateAction'ning agent versiyasi. */
export async function toggleAgentOrderDateAction(
  input: z.input<typeof agentOrderDaySchema>
): Promise<{ ok: true; belgilandi: boolean } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const p = agentOrderDaySchema.parse(input);
    const agent = await prisma.agent.findUnique({ where: { id: p.agentId }, select: { supplierId: true } });
    if (!agent) return { ok: false, error: "Agent topilmadi." };
    const sana = new Date(p.sana + "T00:00:00.000Z");
    const where = { agentId_sana: { agentId: p.agentId, sana } };
    const existing = await prisma.agentOrderDay.findUnique({ where, select: { id: true } });
    let belgilandi: boolean;
    if (existing) {
      await prisma.agentOrderDay.delete({ where });
      belgilandi = false;
    } else {
      await prisma.agentOrderDay.create({ data: { agentId: p.agentId, sana } });
      belgilandi = true;
    }
    revalidateTag(SUPPLIERS_TAG, "max");
    // Stockday "Keladi" agent kunlariga bog'liq — analitika keshini yangilaymiz
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${agent.supplierId}`);
    return { ok: true, belgilandi };
  } catch (err) {
    return actionError(err, "toggleAgentOrderDate");
  }
}

const assignAgentSchema = z.object({
  productId: z.coerce.number().int().positive(),
  agentId: z.coerce.number().int().positive().nullable(),
});

/** Bitta SKU'ni agentga biriktirish (yoki agentId=null — bo'shatish). */
export async function assignSkuAgentAction(input: z.input<typeof assignAgentSchema>): Promise<Result> {
  try {
    await requireSupplierEditor();
    const p = assignAgentSchema.parse(input);
    const product = await prisma.product.findUnique({ where: { id: p.productId }, select: { supplierId: true } });
    if (!product) return { ok: false, error: "SKU topilmadi." };
    if (p.agentId != null) {
      const agent = await prisma.agent.findUnique({ where: { id: p.agentId }, select: { supplierId: true } });
      if (!agent || agent.supplierId !== product.supplierId) {
        return { ok: false, error: "Agent bu yetkazib beruvchiga tegishli emas." };
      }
    }
    await prisma.product.update({ where: { id: p.productId }, data: { agentId: p.agentId } });
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    if (product.supplierId) revalidatePath(`/baza/taminotchilar/${product.supplierId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err, "assignSkuAgent");
  }
}

const bulkAssignSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  agentId: z.coerce.number().int().positive().nullable(),
  subId: z.coerce.number().int().positive().optional(), // berilsa — faqat shu subkat
});

/** Bulk: yetkazib beruvchining barcha (yoki bitta subkat) SKU'larini agentga biriktirish. */
export async function bulkAssignSkuAgentAction(
  input: z.input<typeof bulkAssignSchema>
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const p = bulkAssignSchema.parse(input);
    if (p.agentId != null) {
      const agent = await prisma.agent.findUnique({ where: { id: p.agentId }, select: { supplierId: true } });
      if (!agent || agent.supplierId !== p.supplierId) {
        return { ok: false, error: "Agent bu yetkazib beruvchiga tegishli emas." };
      }
    }
    const res = await prisma.product.updateMany({
      where: { supplierId: p.supplierId, ...(p.subId ? { categoryId: p.subId } : {}) },
      data: { agentId: p.agentId },
    });
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    revalidatePath(`/baza/taminotchilar/${p.supplierId}`);
    return { ok: true, count: res.count };
  } catch (err) {
    return actionError(err, "bulkAssignSkuAgent");
  }
}

/**
 * Yetkazib beruvchini o'chirish (SUPPLYCHAIN/SYSTEM_ADMIN).
 * Zakazlari bor bo'lsa BLOKLANADI (PurchaseOrder cascade — tarix yo'qoladi);
 * SKU'lar yo'qolmaydi (supplierId NULL bo'ladi), shartnomalar o'chadi.
 */
export async function deleteSupplierAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSupplierEditor();
    const sid = z.coerce.number().int().positive().parse(id);
    const orderCount = await prisma.purchaseOrder.count({ where: { supplierId: sid } });
    if (orderCount > 0) {
      return {
        ok: false,
        error: `O'chirib bo'lmaydi: ${orderCount} ta zakaz tarixi bor. Avval zakazlarni ko'rib chiqing.`,
      };
    }
    await prisma.supplier.delete({ where: { id: sid } });
    revalidateTag(SUPPLIERS_TAG, "max");
    revalidatePath("/baza/taminotchilar");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteSupplier");
  }
}
