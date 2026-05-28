"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
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
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}
