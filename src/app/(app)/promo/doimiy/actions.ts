"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, type PromoType, type PromoStatus } from "@/generated/prisma/client";
import { requirePromoView, requirePromoEdit } from "@/lib/auth-helpers";
import { PROMO_CACHE_TAG } from "@/lib/promo";

// ─── Umumiy ────────────────────────────────────────────────────────────────────
type Ok = { ok: true };
type Err = { ok: false; error: string };
type Result = Ok | Err;

const RP = "/promo/doimiy";

function invalidate() {
  revalidateTag(PROMO_CACHE_TAG, "max");
  revalidatePath(RP);
}

function xato(err: unknown): Err {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return { ok: false, error: "Bu SKU bu aksiyaga allaqachon qo'shilgan." };
    if (err.code === "P2025") return { ok: false, error: "Topilmadi (allaqachon o'chirilgan bo'lishi mumkin)." };
    if (err.code === "P2003") return { ok: false, error: "Bog'liq yozuv topilmadi (SKU yoki filial)." };
  }
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  return { ok: false, error: msg };
}

// @db.Date — UTC yarim tunga normallashtiramiz (sana komponenti muhim, vaqt emas)
const toDate = (s: string) => new Date(s + "T00:00:00.000Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ─── Tiplar (Frontend ishlatadi) ───────────────────────────────────────────────
export type PromoCampaignRow = {
  id: number;
  type: PromoType;
  title: string;
  status: PromoStatus;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  branchId: number | null;
  branchName: string | null;
  note: string | null; // izoh (asosan Flash aksiyalar uchun)
  itemsCount: number;
  createdAt: string; // ISO
};

export type PromoItemRow = {
  id: number;
  productId: number;
  name: string;
  code: number; // 1C kod
  regularPrice: number; // sotilish narxi
  promoPrice: number; // aksiya narxi
  promoLimit: number | null; // aksiya limiti (dona)
  priceDiff: number; // = regularPrice − promoPrice (auto)
  pctDiff: number; // = diff / regularPrice * 100 (auto)
};

// ─── Validatsiya ────────────────────────────────────────────────────────────────
// Faqat DOIMIY turlar (FLASH bu bo'limda emas)
const doimiyTypeSchema = z.enum(["KUN_TAKLIFI", "HAFTA_CHEGIRMA", "BIZBOP_NARX", "AAARZON"]);
const statusSchema = z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
const idSchema = z.coerce.number().int().positive();
const priceSchema = z.coerce.number().positive("Narx musbat bo'lishi kerak").max(1e12);
const limitSchema = z.coerce.number().positive("Limit musbat bo'lishi kerak").max(1e9).nullable().optional();

// ─── Aksiya (PromoCampaign) ─────────────────────────────────────────────────────

export async function listCampaignsAction(
  input: { type: PromoType }
): Promise<{ ok: true; rows: PromoCampaignRow[] } | Err> {
  try {
    await requirePromoView();
    const { type } = z.object({ type: doimiyTypeSchema }).parse(input);
    const rows = await prisma.promoCampaign.findMany({
      where: { type },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      select: {
        id: true, type: true, title: true, status: true, startDate: true, endDate: true,
        branchId: true, note: true, createdAt: true,
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });
    return {
      ok: true,
      rows: rows.map((c): PromoCampaignRow => ({
        id: c.id, type: c.type, title: c.title, status: c.status,
        startDate: ymd(c.startDate),
        endDate: c.endDate ? ymd(c.endDate) : null,
        branchId: c.branchId, branchName: c.branch?.name ?? null,
        note: c.note,
        itemsCount: c._count.items,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  } catch (err) { return xato(err); }
}

const createSchema = z.object({
  type: doimiyTypeSchema,
  title: z.string().trim().min(1, "Nom kerak").max(200),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  branchId: idSchema.nullable().optional(),
});

export async function createCampaignAction(input: {
  type: PromoType; title: string; startDate: string; endDate?: string | null; branchId?: number | null;
}): Promise<{ ok: true; id: number } | Err> {
  try {
    const user = await requirePromoEdit();
    const p = createSchema.parse(input);
    if (p.endDate && p.endDate < p.startDate) {
      return { ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas." };
    }
    const c = await prisma.promoCampaign.create({
      data: {
        type: p.type,
        title: p.title,
        status: "DRAFT",
        startDate: toDate(p.startDate),
        endDate: p.endDate ? toDate(p.endDate) : null,
        branchId: p.branchId ?? null,
        createdById: Number(user.id),
      },
      select: { id: true },
    });
    invalidate();
    return { ok: true, id: c.id };
  } catch (err) { return xato(err); }
}

const updateCampaignSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.nullable().optional(),
  branchId: idSchema.nullable().optional(),
  status: statusSchema.optional(),
});

export async function updateCampaignAction(input: {
  id: number; title?: string; startDate?: string; endDate?: string | null; branchId?: number | null; status?: PromoStatus;
}): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = updateCampaignSchema.parse(input);
    const data: Prisma.PromoCampaignUpdateInput = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.startDate !== undefined) data.startDate = toDate(p.startDate);
    if (p.endDate !== undefined) data.endDate = p.endDate ? toDate(p.endDate) : null;
    if (p.status !== undefined) data.status = p.status;
    if (p.branchId !== undefined) {
      data.branch = p.branchId ? { connect: { id: p.branchId } } : { disconnect: true };
    }
    // startDate/endDate ikkalasi ham berilsa tartibni tekshir
    if (p.startDate !== undefined && p.endDate) {
      if (p.endDate < p.startDate) return { ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas." };
    }
    await prisma.promoCampaign.update({ where: { id: p.id }, data });
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function deleteCampaignAction(input: { id: number }): Promise<Result> {
  try {
    await requirePromoEdit();
    const id = idSchema.parse(input.id);
    await prisma.promoCampaign.delete({ where: { id } }); // items Cascade bilan o'chadi
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

// ─── Aksiya SKU qatorlari (PromoItem) ───────────────────────────────────────────

export async function listItemsAction(
  input: { campaignId: number }
): Promise<{ ok: true; rows: PromoItemRow[] } | Err> {
  try {
    await requirePromoView();
    const campaignId = idSchema.parse(input.campaignId);
    const items = await prisma.promoItem.findMany({
      where: { campaignId },
      orderBy: { id: "asc" },
      select: {
        id: true, productId: true, regularPrice: true, promoPrice: true, promoLimit: true,
        product: { select: { name: true, code: true } },
      },
    });
    return {
      ok: true,
      rows: items.map((it): PromoItemRow => {
        // Decimal → number (Prisma Decimal client'ga uzatib bo'lmaydi). Farq/% saqlanmaydi — hisoblanadi.
        const reg = Number(it.regularPrice);
        const promo = Number(it.promoPrice);
        const diff = reg - promo;
        return {
          id: it.id,
          productId: it.productId,
          name: it.product.name,
          code: it.product.code,
          regularPrice: reg,
          promoPrice: promo,
          promoLimit: it.promoLimit != null ? Number(it.promoLimit) : null,
          priceDiff: diff,
          pctDiff: reg > 0 ? (diff / reg) * 100 : 0,
        };
      }),
    };
  } catch (err) { return xato(err); }
}

const addItemSchema = z.object({
  campaignId: idSchema,
  productId: idSchema,
  regularPrice: priceSchema,
  promoPrice: priceSchema,
  promoLimit: limitSchema,
});

export async function addItemAction(input: {
  campaignId: number; productId: number; regularPrice: number; promoPrice: number; promoLimit?: number | null;
}): Promise<{ ok: true; id: number } | Err> {
  try {
    await requirePromoEdit();
    const p = addItemSchema.parse(input);
    const it = await prisma.promoItem.create({
      data: {
        campaignId: p.campaignId,
        productId: p.productId,
        regularPrice: p.regularPrice,
        promoPrice: p.promoPrice,
        promoLimit: p.promoLimit ?? null,
      },
      select: { id: true },
    });
    invalidate();
    return { ok: true, id: it.id };
  } catch (err) { return xato(err); }
}

const updateItemSchema = z.object({
  id: idSchema,
  regularPrice: priceSchema.optional(),
  promoPrice: priceSchema.optional(),
  promoLimit: limitSchema,
});

export async function updateItemAction(input: {
  id: number; regularPrice?: number; promoPrice?: number; promoLimit?: number | null;
}): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = updateItemSchema.parse(input);
    const data: Prisma.PromoItemUpdateInput = {};
    if (p.regularPrice !== undefined) data.regularPrice = p.regularPrice;
    if (p.promoPrice !== undefined) data.promoPrice = p.promoPrice;
    if (p.promoLimit !== undefined) data.promoLimit = p.promoLimit ?? null;
    await prisma.promoItem.update({ where: { id: p.id }, data });
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function deleteItemAction(input: { id: number }): Promise<Result> {
  try {
    await requirePromoEdit();
    const id = idSchema.parse(input.id);
    await prisma.promoItem.delete({ where: { id } });
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

// ─── SKU qidiruv (aksiyaga qo'shish uchun — 25k+ SKU, server-side) ───────────────
export type ProductSearchRow = { id: number; name: string; code: number };

export async function searchProductsAction(
  input: { q: string }
): Promise<{ ok: true; rows: ProductSearchRow[] } | Err> {
  try {
    await requirePromoView();
    const q = z.string().trim().max(100).parse(input.q);
    if (q.length < 2) return { ok: true, rows: [] };
    const isCode = /^\d+$/.test(q);
    const rows = await prisma.product.findMany({
      where: {
        archivedAt: null,
        OR: [
          { name: { contains: q, mode: "insensitive" } }, // GIN trgm (Product_name_trgm_idx)
          ...(isCode ? [{ code: Number(q) }] : []),
        ],
      },
      orderBy: { name: "asc" },
      take: 30,
      select: { id: true, name: true, code: true },
    });
    return { ok: true, rows: rows.map((r): ProductSearchRow => ({ id: r.id, name: r.name, code: r.code })) };
  } catch (err) { return xato(err); }
}

// ─── Narx auto-taklif (ProductSales oxirgi davr o'rtacha sotuv narxi) ────────────
const suggestSchema = z.object({ productId: idSchema, branchId: idSchema.nullable().optional() });

export async function suggestPriceAction(
  input: { productId: number; branchId?: number | null }
): Promise<{ ok: true; price: number | null } | Err> {
  try {
    await requirePromoView();
    const p = suggestSchema.parse(input);
    // Eng oxirgi davr (max periodEnd) bo'yicha o'rtacha narx = SUM(amount)/SUM(soldQty).
    // branchId berilsa o'sha filial; aks holda barcha filiallar yig'indisi.
    const branchCond = p.branchId ? Prisma.sql`AND ps."branchId" = ${p.branchId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ price: number | null }[]>`
      WITH latest AS (
        SELECT MAX("periodEnd") AS pe
        FROM "ProductSales" ps
        WHERE ps."productId" = ${p.productId} ${branchCond}
      )
      SELECT (SUM(ps.amount) / NULLIF(SUM(ps."soldQty"), 0))::float8 AS price
      FROM "ProductSales" ps, latest
      WHERE ps."productId" = ${p.productId} ${branchCond}
        AND ps."periodEnd" = latest.pe
    `;
    const raw = rows[0]?.price ?? null;
    return { ok: true, price: raw != null ? Math.round(raw * 100) / 100 : null };
  } catch (err) { return xato(err); }
}
