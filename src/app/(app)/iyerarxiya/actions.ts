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
