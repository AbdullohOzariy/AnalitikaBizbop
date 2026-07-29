"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { clearStockdayLimitCache, K_GLOBAL_MAX_STOCKDAY } from "@/lib/zakaz/stockday-limit";

/**
 * Maksimal zakaz chegaralarini sozlash — FAQAT SYSTEM_ADMIN.
 * Global standart AppSetting'da, kategoriya istisnolari StockdayLimit jadvalida
 * (WriteoffPlan naqshi: umumiy qiymat sozlamada, kesim bo'yicha qiymatlar jadvalda).
 */

/** Global standart (kun). 0 yoki bo'sh — nazorat O'CHADI. */
export async function saveGlobalLimitAction(maxDays: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const raw = z.string().trim().max(5).parse(maxDays);
    const val = /^\d+$/.test(raw) && Number(raw) > 0 ? String(Number(raw)) : "";

    await prisma.appSetting.upsert({
      where: { key: K_GLOBAL_MAX_STOCKDAY },
      create: { key: K_GLOBAL_MAX_STOCKDAY, value: val },
      update: { value: val },
    });
    clearStockdayLimitCache();
    revalidatePath("/sotuv/nazorat");
    return { ok: true };
  } catch (err) {
    return actionError(err, "nazorat/global");
  }
}

/** Kategoriya istisnosi. `maxDays` bo'sh/0 — istisno O'CHIRILADI (global amal qiladi). */
export async function saveCategoryLimitAction(input: {
  categoryId: number;
  maxDays: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const { categoryId, maxDays, note } = z
      .object({
        categoryId: z.number().int().positive(),
        maxDays: z.string().trim().max(5),
        note: z.string().trim().max(120).optional(),
      })
      .parse(input);

    const n = /^\d+$/.test(maxDays) ? Number(maxDays) : 0;
    if (n <= 0) {
      await prisma.stockdayLimit.deleteMany({ where: { categoryId } });
    } else {
      await prisma.stockdayLimit.upsert({
        where: { categoryId },
        create: { categoryId, maxDays: n, note: note || null },
        update: { maxDays: n, note: note || null },
      });
    }
    clearStockdayLimitCache();
    revalidatePath("/sotuv/nazorat");
    return { ok: true };
  } catch (err) {
    return actionError(err, "nazorat/kategoriya");
  }
}
