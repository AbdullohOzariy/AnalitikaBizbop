"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";
import { normalizeName } from "@/lib/parsers/utils";

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
      include: { _count: { select: { sales: true, plans: true, dailyPlans: true, children: true } } },
    });
    if (!cat) return { ok: false, error: "Topilmadi." };
    const c = cat._count;
    if (c.children > 0) return { ok: false, error: `${c.children} ta subkategoriyasi bor — avval ularni o'chiring.` };
    if (c.sales > 0 || c.plans > 0 || c.dailyPlans > 0) {
      return { ok: false, error: `Bog'langan ma'lumot bor (sotuv: ${c.sales}, reja: ${c.plans + c.dailyPlans}) — o'chirib bo'lmaydi.` };
    }
    await prisma.category.delete({ where: { id } });
    revalidatePath("/iyerarxiya");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
