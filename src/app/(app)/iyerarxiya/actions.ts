"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { normalizeName } from "@/lib/parsers/utils";

export type SkuRow = {
  id: number;
  code: number;
  name: string;
  group: string | null;
  cat: string | null;
  sub: string | null;
  subId: number | null;
  abc: string | null; // ABC×XYZ matritsa holati — rang uchun
  xyz: string | null;
};

const SKU_PAGE = 50;

/** SKU ro'yxati — qidiruv (nom/kod) + filtr (guruh/kategoriya/subkat) + pagination. */
export async function searchSkusAction(input: {
  q?: string;
  groupId?: number;
  catId?: number;
  subId?: number;
  page?: number;
  holat?: "aktiv" | "arxiv" | "nomzod"; // nomzod = aktiv, lekin 3 oy savdosiz (arxiv nomzodi)
}): Promise<{ ok: true; rows: SkuRow[]; total: number; page: number; pageSize: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const q = (input.q ?? "").trim();
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const where: Prisma.ProductWhereInput =
      input.holat === "arxiv"
        ? { archivedAt: { not: null } }
        : input.holat === "nomzod"
          ? { archivedAt: null, abcClass: null } // 3 oy savdosiz, hali aktiv
          : { archivedAt: null };
    if (q) {
      const num = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        ...(num !== undefined ? [{ code: num }] : []),
      ];
    }
    // Filtr — eng aniqdan: subkat > kategoriya > guruh
    if (input.subId) where.categoryId = input.subId;
    else if (input.catId) where.category = { parentId: input.catId };
    else if (input.groupId) where.category = { groupId: input.groupId };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true, code: true, name: true,
          abcClass: true, xyzClass: true,
          category: {
            select: {
              id: true, name: true,
              parent: { select: { name: true } },
              group: { select: { name: true } },
            },
          },
        },
        orderBy: { code: "asc" },
        skip: (page - 1) * SKU_PAGE,
        take: SKU_PAGE,
      }),
      prisma.product.count({ where }),
    ]);
    const out: SkuRow[] = rows.map((r) => {
      const c = r.category;
      return {
        id: r.id, code: r.code, name: r.name,
        group: c?.group?.name ?? null,
        cat: c?.parent?.name ?? null,
        sub: c?.name ?? null,
        subId: c?.id ?? null,
        abc: r.abcClass,
        xyz: r.xyzClass,
      };
    });
    return { ok: true, rows: out, total, page, pageSize: SKU_PAGE };
  } catch (err) {
    return actionError(err, "searchSkus");
  }
}

/** SKU tahrirlash — nom va/yoki subkategoriya. */
export async function updateProductAction(input: {
  productId: number;
  name?: string;
  subId?: number;
  code?: number; // 1C kodni keyin biriktirish/o'zgartirish (vaqtinchalik koddan haqiqiyga)
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const pid = z.coerce.number().int().positive().parse(input.productId);
    const data: Prisma.ProductUpdateInput = {};
    if (input.name !== undefined) {
      data.name = z.string().trim().min(1, "Nom kerak").max(255).parse(input.name);
    }
    if (input.subId !== undefined) {
      const sid = z.coerce.number().int().positive().parse(input.subId);
      const sub = await prisma.category.findUnique({ where: { id: sid }, select: { parentId: true } });
      if (!sub || sub.parentId == null) return { ok: false, error: "Faqat subkategoriya tanlanishi mumkin." };
      data.category = { connect: { id: sid } };
    }
    if (input.code !== undefined) {
      const code = z.coerce.number().int().positive().max(2_000_000_000).parse(input.code);
      const taken = await prisma.product.findFirst({ where: { code, id: { not: pid } }, select: { id: true } });
      if (taken) return { ok: false, error: `Bu kod (${code}) allaqachon boshqa SKU'da bor.` };
      data.code = code;
    }
    if (Object.keys(data).length === 0) return { ok: false, error: "O'zgarish yo'q." };
    await prisma.product.update({ where: { id: pid }, data });
    revalidatePath("/iyerarxiya");
    revalidateTag("iyerarxiya", "max");
    // Mahsulot nomi/kategoriyasi marja/savdo keshlarida ko'rinadi
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "updateProduct");
  }
}

const createSkuSchema = z.object({
  name: z.string().trim().min(1, "Nom kerak").max(255),
  code: z.coerce.number().int().positive().max(2_000_000_000).optional(), // ixtiyoriy — keyin biriktirilsa ham bo'ladi
  categoryId: z.coerce.number().int().positive(),
});

/**
 * Yangi SKU qo'lda qo'shish. Kod ixtiyoriy — berilmasa VAQTINCHALIK manfiy unikal kod
 * beriladi (1C kodlari musbat; keyin tahrirlab haqiqiy kodga almashtiriladi). Qoldiq/sotuv
 * null (UI'da 0) — keyingi sotuv yuklashlarida kod bo'yicha avtomatik to'ladi.
 */
export async function createSkuAction(
  input: z.input<typeof createSkuSchema>
): Promise<{ ok: true; id: number; code: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const p = createSkuSchema.parse(input);
    const sub = await prisma.category.findUnique({ where: { id: p.categoryId }, select: { parentId: true } });
    if (!sub || sub.parentId == null) return { ok: false, error: "Faqat subkategoriya tanlanishi mumkin." };

    let code = p.code;
    if (code != null) {
      const taken = await prisma.product.findUnique({ where: { code }, select: { id: true } });
      if (taken) return { ok: false, error: `Bu kod (${code}) allaqachon mavjud.` };
    } else {
      // Vaqtinchalik unikal kod — eng kichik koddan 1 kam (manfiy)
      const agg = await prisma.product.aggregate({ _min: { code: true } });
      code = Math.min(0, agg._min.code ?? 0) - 1;
    }

    const created = await prisma.product.create({
      data: { code, name: p.name, categoryId: p.categoryId }, // qoldiq/sotuv null — keyin to'ladi
      select: { id: true, code: true },
    });
    revalidatePath("/iyerarxiya");
    revalidateTag("iyerarxiya", "max");
    return { ok: true, id: created.id, code: created.code };
  } catch (err) {
    return actionError(err, "createSku");
  }
}

const addSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  alias: z.string().trim().min(1).max(120),
});

export type SubProduct = { code: number; name: string };

const SUB_PRODUCTS_LIMIT = 250; // ko'rsatiladigan maksimal — qolganini qidiruv orqali topiladi

/** Subkategoriya (yoki kategoriya) ostidagi SKU mahsulotlarni lazy yuklaydi. */
export async function subProductsAction(
  subId: number
): Promise<{ ok: true; products: SubProduct[]; total: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const id = z.coerce.number().int().positive().parse(subId);
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { categoryId: id },
        select: { code: true, name: true },
        orderBy: { name: "asc" },
        take: SUB_PRODUCTS_LIMIT,
      }),
      prisma.product.count({ where: { categoryId: id } }),
    ]);
    return { ok: true, products, total };
  } catch (err) {
    return actionError(err, "subProducts");
  }
}

export type SkuSearchResult = {
  code: number;
  name: string;
  sub: string | null;
  cat: string | null;
  group: string | null;
};

/** Butun katalog bo'yicha SKU qidiruvi (nom yoki 1C kod). Eng ko'pi 50 natija. */
export async function searchSkuAction(
  query: string
): Promise<{ ok: true; results: SkuSearchResult[]; total: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const q = z.string().trim().min(2).max(100).parse(query);
    const num = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
    const where = {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        ...(num !== undefined ? [{ code: num }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          code: true,
          name: true,
          category: {
            select: {
              name: true,
              group: { select: { name: true } },
              parent: { select: { name: true, group: { select: { name: true } } } },
            },
          },
        },
        orderBy: { name: "asc" },
        take: 50,
      }),
      prisma.product.count({ where }),
    ]);
    const results: SkuSearchResult[] = rows.map((r) => {
      const c = r.category;
      const isSub = !!c?.parent; // categoryId subkategoriyaga ishora qiladi (parent = kategoriya)
      return {
        code: r.code,
        name: r.name,
        sub: isSub ? c!.name : null,
        cat: isSub ? c!.parent!.name : (c?.name ?? null),
        group: c?.group?.name ?? c?.parent?.group?.name ?? null,
      };
    });
    return { ok: true, results, total };
  } catch (err) {
    return actionError(err, "searchSku");
  }
}

export async function addCategoryAliasAction(
  input: { categoryId: number; alias: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const parsed = addSchema.parse(input);
    await prisma.categoryAlias.create({
      data: {
        categoryId: parsed.categoryId,
        alias: normalizeName(parsed.alias),
      },
    });
    revalidatePath("/iyerarxiya");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Xato.";
    if (msg.includes("Unique")) return { ok: false, error: "Bu alias allaqachon mavjud." };
    return { ok: false, error: msg };
  }
}

export async function deleteCategoryAliasAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    await prisma.categoryAlias.delete({ where: { id } });
    revalidatePath("/iyerarxiya");
    return { ok: true };
  } catch (err) {
    return actionError(err, "iyerarxiya");
  }
}

// ─── Iyerarxiya editori (admin) ───────────────────────────────────────────────

type Result = { ok: true } | { ok: false; error: string };

function fail(err: unknown): Result {
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.toLowerCase().includes("unique")) {
    if (msg.includes("code")) return { ok: false, error: "Bu KOD allaqachon ishlatilgan." };
    return { ok: false, error: "Takrorlanuvchi qiymat." };
  }
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  return { ok: false, error: msg };
}

const nameField = z.string().trim().min(1, "Nom bo'sh bo'lmasin").max(120);
const codeField = z
  .union([z.coerce.number().int().positive(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v === "" || v == null ? null : Number(v)));

// ── Guruh ──
const groupSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: nameField,
  code: codeField,
  sortOrder: z.coerce.number().int().optional(),
});

export async function saveGroupAction(input: {
  id?: number;
  name: string;
  code?: number | string | null;
  sortOrder?: number;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = groupSchema.parse(input);
    if (p.id) {
      await prisma.categoryGroup.update({
        where: { id: p.id },
        data: { name: p.name, code: p.code, ...(p.sortOrder != null ? { sortOrder: p.sortOrder } : {}) },
      });
    } else {
      await prisma.categoryGroup.create({
        data: { name: p.name, code: p.code, sortOrder: p.sortOrder ?? 0 },
      });
    }
    revalidatePath("/iyerarxiya");
    revalidateTag(ANALYTICS_CACHE_TAG, "max"); // guruh/kategoriya nomi-tartibi analitika keshlarida
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGroupAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const count = await prisma.category.count({ where: { groupId: id } });
    if (count > 0) {
      return { ok: false, error: `Guruhda ${count} ta kategoriya bor — avval ularni ko'chiring yoki o'chiring.` };
    }
    await prisma.categoryGroup.delete({ where: { id } });
    revalidatePath("/iyerarxiya");
    revalidateTag(ANALYTICS_CACHE_TAG, "max"); // guruh/kategoriya nomi-tartibi analitika keshlarida
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ── Kategoriya / subkategoriya ──
const categorySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: nameField,
  code: codeField,
  groupId: z.coerce.number().int().positive().nullish(),
  parentId: z.coerce.number().int().positive().nullish(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function saveCategoryAction(input: {
  id?: number;
  name: string;
  code?: number | string | null;
  groupId?: number | null;
  parentId?: number | null;
  sortOrder?: number;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = categorySchema.parse(input);
    // subkategoriya bo'lsa groupId=null, top-level bo'lsa parentId=null
    const parentId = p.parentId ?? null;
    const groupId = parentId ? null : p.groupId ?? null;
    if (parentId && parentId === p.id) {
      return { ok: false, error: "Kategoriya o'ziga parent bo'la olmaydi." };
    }
    if (p.id) {
      await prisma.category.update({
        where: { id: p.id },
        data: {
          name: p.name,
          code: p.code,
          groupId,
          parentId,
          ...(p.sortOrder != null ? { sortOrder: p.sortOrder } : {}),
        },
      });
    } else {
      await prisma.category.create({
        data: { name: p.name, code: p.code, groupId, parentId, sortOrder: p.sortOrder ?? 0 },
      });
    }
    revalidatePath("/iyerarxiya");
    revalidateTag(ANALYTICS_CACHE_TAG, "max"); // guruh/kategoriya nomi-tartibi analitika keshlarida
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCategoryAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const cat = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { sales: true, children: true } } },
    });
    if (!cat) return { ok: false, error: "Topilmadi." };
    const c = cat._count;
    if (c.children > 0) return { ok: false, error: `${c.children} ta subkategoriyasi bor — avval ularni o'chiring.` };
    if (c.sales > 0) {
      return { ok: false, error: `Bog'langan ma'lumot bor (sotuv: ${c.sales}) — o'chirib bo'lmaydi.` };
    }
    await prisma.category.delete({ where: { id } });
    revalidatePath("/iyerarxiya");
    revalidateTag(ANALYTICS_CACHE_TAG, "max"); // guruh/kategoriya nomi-tartibi analitika keshlarida
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}


// ═══════════════════ No-aktiv SKU arxivi ═══════════════════
// "No-aktiv" = abcClass NULL (so'nggi 3 oylik standart oynada savdo yo'q —
// updateProductMatrixClasses shu semantikani saqlaydi).

/** Arxivlash nomzodlari soni: qoldiqsizlar va qoldiqlilar alohida. */
export async function inactiveSkuCountsAction(): Promise<
  { ok: true; stockZero: number; withStock: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const base: Prisma.ProductWhereInput = { abcClass: null, archivedAt: null };
    const noStock: Prisma.ProductWhereInput = {
      ...base,
      OR: [{ currentStock: null }, { currentStock: { lte: 0 } }],
    };
    const [total, stockZero] = await Promise.all([
      prisma.product.count({ where: base }),
      prisma.product.count({ where: noStock }),
    ]);
    return { ok: true, stockZero, withStock: total - stockZero };
  } catch (err) {
    return actionError(err, "inactiveCounts");
  }
}

/**
 * 3 oy savdosiz SKU'larni ommaviy arxivlash.
 * includeWithStock=false — faqat qoldiqsizlar (qoldiqlilar avval sotib
 * tugatilishi/spisaniya qilinishi kerak — ular OOS "o'lik qoldiq"da turadi).
 */
export async function archiveInactiveSkusAction(input: {
  includeWithStock: boolean;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const res = await prisma.product.updateMany({
      where: {
        abcClass: null,
        archivedAt: null,
        ...(input.includeWithStock
          ? {}
          : { OR: [{ currentStock: null }, { currentStock: { lte: 0 } }] }),
      },
      data: { archivedAt: new Date() },
    });
    revalidatePath("/iyerarxiya");
    revalidateTag("iyerarxiya", "max");
    // OOS/Stockday va boshqa SKU ro'yxatlari keshlari yangilansin
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, count: res.count };
  } catch (err) {
    return actionError(err, "archiveInactive");
  }
}

/** Bitta SKU'ni arxivlash/qaytarish. */
export async function setSkuArchivedAction(
  productId: number,
  archived: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const pid = z.coerce.number().int().positive().parse(productId);
    await prisma.product.update({
      where: { id: pid },
      data: { archivedAt: archived ? new Date() : null },
    });
    revalidatePath("/iyerarxiya");
    revalidateTag("iyerarxiya", "max");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "setSkuArchived");
  }
}
