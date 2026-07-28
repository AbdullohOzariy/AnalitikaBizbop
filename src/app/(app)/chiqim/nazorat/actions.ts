"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { actionError, type ActionResult } from "@/lib/action-error";
import { WRITEOFF_TOTAL_PLAN_KEY } from "@/lib/spisaniya/writeoff-plan";

const id = z.coerce.number().int().positive();
// Chiqim ulushi savdodan — amalda bir necha foiz. 100 dan yuqorisi ma'nosiz.
const pctZ = z.coerce.number().min(0).max(100);

const planSchema = z.object({
  // null = barcha filiallarga bir xil reja yoziladi (kiritishni tezlashtirish uchun)
  branchId: id.nullable(),
  categoryId: id,
  pct: pctZ,
});

/** Subkategoriya chiqim rejasi (% savdodan). branchId null bo'lsa — barcha filiallarga. */
export async function upsertWriteoffPlanAction(
  input: z.input<typeof planSchema>
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const p = planSchema.parse(input);
    const branchIds = p.branchId
      ? [p.branchId]
      : (await prisma.branch.findMany({ select: { id: true } })).map((b) => b.id);

    await prisma.$transaction(
      branchIds.map((branchId) =>
        prisma.writeoffPlan.upsert({
          where: { branchId_categoryId: { branchId, categoryId: p.categoryId } },
          create: { branchId, categoryId: p.categoryId, pct: p.pct },
          update: { pct: p.pct },
        })
      )
    );
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true };
  } catch (e) {
    return actionError(e, "chiqim-nazorat");
  }
}

const totalSchema = z.object({ pct: pctZ.nullable() });

/** Kompaniya bo'yicha umumiy chiqim chegarasi (%). null — chegarani olib tashlaydi. */
export async function setWriteoffTotalPlanAction(
  input: z.input<typeof totalSchema>
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const p = totalSchema.parse(input);
    if (p.pct == null) {
      await prisma.appSetting.deleteMany({ where: { key: WRITEOFF_TOTAL_PLAN_KEY } });
    } else {
      const value = String(p.pct);
      await prisma.appSetting.upsert({
        where: { key: WRITEOFF_TOTAL_PLAN_KEY },
        create: { key: WRITEOFF_TOTAL_PLAN_KEY, value },
        update: { value },
      });
    }
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true };
  } catch (e) {
    return actionError(e, "chiqim-nazorat");
  }
}

export type ClearWriteoffPlansResult = { ok: true; count: number } | { ok: false; error: string };

/** Barcha chiqim rejalarini tozalaydi (filial × subkat; umumiy chegara tegilmaydi). */
export async function clearWriteoffPlansAction(): Promise<ClearWriteoffPlansResult> {
  try {
    await requireAdmin();
    const res = await prisma.writeoffPlan.deleteMany({});
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, count: res.count };
  } catch (e) {
    return actionError(e, "chiqim-nazorat");
  }
}
