"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSystemAdmin } from "@/lib/roles";
import { normalizeName } from "@/lib/parsers/utils";
import { kategoriyalarSoni } from "@/lib/spisaniya/db";
import { actionError } from "@/lib/action-error";

async function requireEditor() {
  const session = await auth();
  if (!session?.user || !isSystemAdmin(session.user.role)) throw new Error("Ruxsat yo'q");
}

const setSchema = z.object({
  botName: z.string().trim().min(1).max(200),
  categoryId: z.number().int().positive().nullable(),
});

/** Bitta bizbop kategoriyani subkatga bog'laydi (categoryId=null → uzadi). */
export async function setSpisaniyaLinkAction(
  input: z.input<typeof setSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireEditor();
    const p = setSchema.parse(input);
    if (p.categoryId == null) {
      await prisma.spisaniyaCategoryLink.deleteMany({ where: { botName: p.botName } });
    } else {
      await prisma.spisaniyaCategoryLink.upsert({
        where: { botName: p.botName },
        create: { botName: p.botName, categoryId: p.categoryId },
        update: { categoryId: p.categoryId },
      });
    }
    revalidatePath("/baza/chiqim-kategoriya");
    return { ok: true };
  } catch (err) {
    return actionError(err, "chiqim-kategoriya");
  }
}

/** Nomi bo'yicha avto-bog'lash — bizbop kat nomi normalizatsiyada subkat nomiga teng bo'lsa. */
export async function autoMapByNameAction(): Promise<
  { ok: true; linked: number } | { ok: false; error: string }
> {
  try {
    await requireEditor();
    const [bizbop, subcats, existing] = await Promise.all([
      kategoriyalarSoni(),
      prisma.category.findMany({ where: { parentId: { not: null } }, select: { id: true, name: true } }),
      prisma.spisaniyaCategoryLink.findMany({ select: { botName: true } }),
    ]);
    const linkedNames = new Set(existing.map((e) => e.botName));
    const byNorm = new Map<string, number>();
    for (const s of subcats) {
      const k = normalizeName(s.name);
      if (!byNorm.has(k)) byNorm.set(k, s.id); // birinchi mos kelganini olamiz
    }
    let linked = 0;
    for (const b of bizbop) {
      if (linkedNames.has(b.nomi)) continue;
      const id = byNorm.get(normalizeName(b.nomi));
      if (id) {
        await prisma.spisaniyaCategoryLink.create({ data: { botName: b.nomi, categoryId: id } });
        linked++;
      }
    }
    revalidatePath("/baza/chiqim-kategoriya");
    return { ok: true, linked };
  } catch (err) {
    return actionError(err, "chiqim-kategoriya");
  }
}
