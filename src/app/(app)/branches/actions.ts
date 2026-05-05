"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AliasSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

const addSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  alias: z.string().trim().min(1),
  source: z.enum(["SALES", "VISITS", "SR", "PLANS"]),
});

export async function addAliasAction(
  input: { branchId: number; alias: string; source: AliasSource }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const parsed = addSchema.parse(input);
    await prisma.branchAlias.create({
      data: {
        branchId: parsed.branchId,
        alias: parsed.alias,
        source: parsed.source as AliasSource,
      },
    });
    revalidatePath("/branches");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Xato.";
    if (msg.includes("Unique")) return { ok: false, error: "Bu alias allaqachon mavjud." };
    return { ok: false, error: msg };
  }
}

export async function deleteAliasAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    await prisma.branchAlias.delete({ where: { id } });
    revalidatePath("/branches");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}
