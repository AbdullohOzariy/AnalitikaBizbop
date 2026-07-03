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
  console.error("[promo]", err);
  return { ok: false, error: "Amal bajarilmadi. Birozdan so'ng qayta urinib ko'ring." };
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
  groupId: number | null; // aksiya ichidagi SKU guruhi (null = guruhsiz)
  name: string;
  code: number; // 1C kod
  regularPrice: number; // sotilish narxi
  promoPrice: number; // aksiya narxi
  promoLimit: number | null; // aksiya limiti (dona)
  priceDiff: number; // = regularPrice − promoPrice (auto)
  pctDiff: number; // = diff / regularPrice * 100 (auto)
};

export type PromoGroupRow = {
  id: number;
  name: string;
  sortOrder: number;
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
): Promise<{ ok: true; rows: PromoItemRow[]; groups: PromoGroupRow[]; preparedCount: number } | Err> {
  try {
    await requirePromoView();
    const campaignId = idSchema.parse(input.campaignId);
    // preparedCount = rasm yuklangan dizaynlar (guruh + guruhsiz SKU) — birdan yuklash tugmasi uchun.
    // imageData (Text) yuklanmaydi — faqat IS NOT NULL filtri (yengil count).
    const [items, groups, gImg, iImg] = await Promise.all([
      prisma.promoItem.findMany({
        where: { campaignId },
        orderBy: { id: "asc" },
        select: {
          id: true, productId: true, groupId: true, regularPrice: true, promoPrice: true, promoLimit: true,
          product: { select: { name: true, code: true } },
        },
      }),
      prisma.promoItemGroup.findMany({
        where: { campaignId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, name: true, sortOrder: true },
      }),
      prisma.promoItemGroup.count({ where: { campaignId, imageData: { not: null } } }),
      prisma.promoItem.count({ where: { campaignId, groupId: null, imageData: { not: null } } }),
    ]);
    return {
      ok: true,
      preparedCount: gImg + iImg,
      rows: items.map((it): PromoItemRow => {
        // Decimal → number (Prisma Decimal client'ga uzatib bo'lmaydi). Farq/% saqlanmaydi — hisoblanadi.
        const reg = Number(it.regularPrice);
        const promo = Number(it.promoPrice);
        const diff = reg - promo;
        return {
          id: it.id,
          productId: it.productId,
          groupId: it.groupId,
          name: it.product.name,
          code: it.product.code,
          regularPrice: reg,
          promoPrice: promo,
          promoLimit: it.promoLimit != null ? Number(it.promoLimit) : null,
          priceDiff: diff,
          pctDiff: reg > 0 ? (diff / reg) * 100 : 0,
        };
      }),
      groups: groups.map((g): PromoGroupRow => ({ id: g.id, name: g.name, sortOrder: g.sortOrder })),
    };
  } catch (err) { return xato(err); }
}

// ─── SKU guruhlari (aksiya ichida) ──────────────────────────────────────────────
// Bir mahsulotning har xil ta'm/turlarini guruhga jamlash. "Guruhga bitta narx":
// guruhdagi har SKU bir xil aksiya narxi bilan alohida PromoItem bo'ladi (keyin
// alohida tahrirlanadi). Sotilish narxi MEGA filial oxirgi davr narxidan avto.

const createGroupSchema = z.object({
  campaignId: idSchema,
  name: z.string().trim().min(1, "Guruh nomi kerak").max(200),
  // SKU ixtiyoriy — bo'sh guruh yaratib, keyin drag-drop bilan to'ldirish mumkin.
  productIds: z.array(idSchema).max(300).optional().default([]),
  promoPrice: priceSchema.nullable().optional(),
  promoLimit: limitSchema,
});

export async function createGroupAction(input: {
  campaignId: number; name: string; productIds?: number[]; promoPrice?: number | null; promoLimit?: number | null;
}): Promise<{ ok: true; added: number; skipped: number } | Err> {
  try {
    await requirePromoEdit();
    const p = createGroupSchema.parse(input);

    // SKU'siz bo'sh guruh — keyin SKU'lar sudrab (drag-drop) qo'shiladi.
    if (p.productIds.length === 0) {
      await prisma.promoItemGroup.create({ data: { campaignId: p.campaignId, name: p.name } });
      invalidate();
      return { ok: true, added: 0, skipped: 0 };
    }

    // SKU bilan birga yaratilsa — aksiya narxi shart (hammasiga qo'yiladi).
    if (p.promoPrice == null || !(p.promoPrice > 0)) {
      return { ok: false, error: "Aksiya narxini kiriting." };
    }
    const promoPrice = p.promoPrice;

    // Allaqachon qo'shilgan SKU'lar — o'tkazib yuboriladi (unique campaignId+productId).
    const dup = await prisma.promoItem.findMany({
      where: { campaignId: p.campaignId, productId: { in: p.productIds } },
      select: { productId: true },
    });
    const dupSet = new Set(dup.map((d) => d.productId));
    const newIds = p.productIds.filter((id) => !dupSet.has(id));
    if (newIds.length === 0) return { ok: false, error: "Tanlangan SKU'lar allaqachon qo'shilgan." };

    // Sotilish narxlari — MEGA filial (Mega Center) oxirgi davr (batch, bitta query).
    const mega = await prisma.branch.findFirst({
      where: { name: { contains: "mega", mode: "insensitive" } },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const megaCond = mega ? Prisma.sql`AND ps."branchId" = ${mega.id}` : Prisma.empty;
    const priceRows = await prisma.$queryRaw<{ productId: number; price: number | null }[]>`
      WITH latest AS (
        SELECT ps."productId" AS pid, MAX(ps."periodEnd") AS pe
        FROM "ProductSales" ps
        WHERE ps."productId" IN (${Prisma.join(newIds)}) ${megaCond}
        GROUP BY ps."productId"
      )
      SELECT ps."productId" AS "productId",
        COALESCE(
          AVG(ps."salePrice")::float8,
          (SUM(ps.amount) / NULLIF(SUM(ps."soldQty"), 0))::float8
        ) AS price
      FROM "ProductSales" ps
      JOIN latest l ON l.pid = ps."productId" AND ps."periodEnd" = l.pe
      WHERE ps."productId" IN (${Prisma.join(newIds)}) ${megaCond}
      GROUP BY ps."productId"
    `;
    const priceMap = new Map<number, number>();
    // Faqat MUSBAT narx (0/manfiy = "topilmadi" → promoPrice fallback'ga o'tadi; aks holda
    // `?? promoPrice` 0'ni ushlamay regularPrice=0 saqlardi — bitta qo'shish yo'li bilan nomuvofiq).
    for (const r of priceRows) if (r.price != null && r.price > 0) priceMap.set(r.productId, Math.round(r.price * 100) / 100);

    // Guruh + SKU'lar bitta tranzaksiyada.
    await prisma.$transaction(async (tx) => {
      const grp = await tx.promoItemGroup.create({
        data: { campaignId: p.campaignId, name: p.name },
        select: { id: true },
      });
      await tx.promoItem.createMany({
        data: newIds.map((pid) => ({
          campaignId: p.campaignId,
          productId: pid,
          groupId: grp.id,
          // Sotilish narxi topilmasa aksiya narxiga teng (farq 0) — xodim keyin to'g'irlaydi.
          regularPrice: priceMap.get(pid) ?? promoPrice,
          promoPrice,
          promoLimit: p.promoLimit ?? null,
        })),
      });
    });

    invalidate();
    return { ok: true, added: newIds.length, skipped: p.productIds.length - newIds.length };
  } catch (err) { return xato(err); }
}

export async function renameGroupAction(input: { id: number; name: string }): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = z.object({ id: idSchema, name: z.string().trim().min(1, "Nom kerak").max(200) }).parse(input);
    await prisma.promoItemGroup.update({ where: { id: p.id }, data: { name: p.name } });
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

// Guruhni o'chirish. keepItems=true → faqat guruh o'chadi, SKU'lar GURUHSIZ bo'lib qoladi
// (groupId → SetNull avtomatik). keepItems=false (yoki berilmasa) → guruh + ichidagi SKU'lar o'chadi.
const deleteGroupSchema = z.object({ id: idSchema, keepItems: z.boolean().optional() });

export async function deleteGroupAction(input: { id: number; keepItems?: boolean }): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = deleteGroupSchema.parse(input);
    if (p.keepItems) {
      // Guruhni tarqatish — SKU'lar saqlanadi (groupId SetNull bilan null bo'ladi).
      await prisma.promoItemGroup.delete({ where: { id: p.id } });
    } else {
      // Guruh + ichidagi barcha SKU o'chiriladi (SetNull bo'lgani uchun SKU'larni qo'lda).
      await prisma.$transaction([
        prisma.promoItem.deleteMany({ where: { groupId: p.id } }),
        prisma.promoItemGroup.delete({ where: { id: p.id } }),
      ]);
    }
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

// ─── Dizayn banner (rasm + nom) ─────────────────────────────────────────────
const saveDesignSchema = z.object({
  kind: z.enum(["item", "group"]),
  id: idSchema,
  designTitle: z.string().trim().max(200).nullable().optional(),
  designTitleRu: z.string().trim().max(200).nullable().optional(),
  // base64 data URL (client canvas resize qilingan); ~900KB cheklov (server-action 1MB limiti).
  imageData: z.string().max(900_000).regex(/^data:image\/(png|webp);base64,/, "Rasm formati noto'g'ri").nullable().optional(),
});

export async function saveDesignAction(input: {
  kind: "item" | "group"; id: number; designTitle?: string | null; designTitleRu?: string | null; imageData?: string | null;
}): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = saveDesignSchema.parse(input);
    const data: { designTitle: string | null; designTitleRu: string | null; imageData?: string | null } = {
      designTitle: p.designTitle?.trim() || null,
      designTitleRu: p.designTitleRu?.trim() || null,
    };
    if (p.imageData !== undefined) data.imageData = p.imageData; // undefined = rasm o'zgartirilmaydi
    if (p.kind === "group") await prisma.promoItemGroup.update({ where: { id: p.id }, data });
    else await prisma.promoItem.update({ where: { id: p.id }, data });
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

// Dizayn dialog ochilganda nom + rasm (katta base64) — listItemsAction'ga kirmaydi (yengil).
export type DesignFields = { designTitle: string | null; designTitleRu: string | null; imageData: string | null };

export async function getDesignAction(input: {
  kind: "item" | "group"; id: number;
}): Promise<{ ok: true; design: DesignFields } | Err> {
  try {
    await requirePromoView();
    const p = z.object({ kind: z.enum(["item", "group"]), id: idSchema }).parse(input);
    const row = p.kind === "group"
      ? await prisma.promoItemGroup.findUnique({ where: { id: p.id }, select: { designTitle: true, designTitleRu: true, imageData: true } })
      : await prisma.promoItem.findUnique({ where: { id: p.id }, select: { designTitle: true, designTitleRu: true, imageData: true } });
    if (!row) return { ok: false, error: "Topilmadi." };
    return { ok: true, design: { designTitle: row.designTitle, designTitleRu: row.designTitleRu, imageData: row.imageData } };
  } catch (err) { return xato(err); }
}

// Mavjud SKU'ni guruhga ko'chirish (drag-drop). groupId=null → guruhdan chiqarish.
// Xavfsizlik: SKU va guruh AYNAN bir kampaniyaga tegishli bo'lishi shart.
const moveItemSchema = z.object({ itemId: idSchema, groupId: idSchema.nullable() });

export async function moveItemToGroupAction(input: {
  itemId: number; groupId: number | null;
}): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = moveItemSchema.parse(input);
    const item = await prisma.promoItem.findUnique({
      where: { id: p.itemId },
      select: { campaignId: true, groupId: true },
    });
    if (!item) return { ok: false, error: "SKU topilmadi." };
    if (item.groupId === p.groupId) return { ok: true }; // o'zgarish yo'q
    if (p.groupId != null) {
      const group = await prisma.promoItemGroup.findUnique({
        where: { id: p.groupId },
        select: { campaignId: true },
      });
      if (!group) return { ok: false, error: "Guruh topilmadi." };
      if (group.campaignId !== item.campaignId) return { ok: false, error: "Guruh boshqa aksiyaga tegishli." };
    }
    await prisma.promoItem.update({ where: { id: p.itemId }, data: { groupId: p.groupId } });
    invalidate();
    return { ok: true };
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

// ─── Narx auto-taklif — MEGA filial (Mega Center) oxirgi davr SOTUV NARXI ────────
// Promo sotilish narxi har doim MEGA filial narxidan (aksiya filialidan qat'i nazar).
// Asosiy: salePrice (Продажи Цена, tayyor narx). Eski formatda (salePrice yo'q) —
// fallback amount/soldQty (Продажи Сумма ÷ Количество).
const suggestSchema = z.object({ productId: idSchema });

export async function suggestPriceAction(
  input: { productId: number }
): Promise<{ ok: true; price: number | null } | Err> {
  try {
    await requirePromoView();
    const p = suggestSchema.parse(input);
    // MEGA filialni nom bo'yicha topamiz (BranchAlias "Market MEGA market" → "Mega Center").
    const mega = await prisma.branch.findFirst({
      where: { name: { contains: "mega", mode: "insensitive" } },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const branchCond = mega ? Prisma.sql`AND ps."branchId" = ${mega.id}` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ sale_price: number | null; avg_price: number | null }[]>`
      WITH latest AS (
        SELECT MAX("periodEnd") AS pe
        FROM "ProductSales" ps
        WHERE ps."productId" = ${p.productId} ${branchCond}
      )
      SELECT
        AVG(ps."salePrice")::float8 AS sale_price,
        (SUM(ps.amount) / NULLIF(SUM(ps."soldQty"), 0))::float8 AS avg_price
      FROM "ProductSales" ps, latest
      WHERE ps."productId" = ${p.productId} ${branchCond}
        AND ps."periodEnd" = latest.pe
    `;
    const raw = rows[0]?.sale_price ?? rows[0]?.avg_price ?? null;
    return { ok: true, price: raw != null ? Math.round(raw * 100) / 100 : null };
  } catch (err) { return xato(err); }
}
