"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { actionError } from "@/lib/action-error";
import {
  generateForecast,
  applyForecastDayEdit,
  getForecastDays,
  type GroupForecastResult,
  type ForecastDayCell,
} from "@/lib/forecast";

const id = z.coerce.number().int().positive();
const yearZ = z.coerce.number().int().min(2000).max(2100);
const monthZ = z.coerce.number().int().min(1).max(12);

const salesSchema = z.object({
  branchId: id, categoryId: id, year: yearZ, month: monthZ,
  amount: z.coerce.number().min(0).max(1e15),
});
const marginSchema = z.object({
  branchId: id, categoryId: id,
  marginPct: z.coerce.number().min(0).max(100),
});

export async function upsertSalesPlan(input: z.input<typeof salesSchema>) {
  await requireAdmin();
  const p = salesSchema.parse(input);
  await prisma.salesPlan.upsert({
    where: { branchId_categoryId_year_month: { branchId: p.branchId, categoryId: p.categoryId, year: p.year, month: p.month } },
    create: { branchId: p.branchId, categoryId: p.categoryId, year: p.year, month: p.month, amount: p.amount },
    update: { amount: p.amount },
  });
  // Reja o'zgardi → dashboard prognozi qayta hisoblansin.
  revalidateTag(ANALYTICS_CACHE_TAG, "max");
}

export async function upsertMarginPlan(input: z.input<typeof marginSchema>) {
  await requireAdmin();
  const p = marginSchema.parse(input);
  await prisma.marginPlan.upsert({
    where: { branchId_categoryId: { branchId: p.branchId, categoryId: p.categoryId } },
    create: { branchId: p.branchId, categoryId: p.categoryId, marginPct: p.marginPct },
    update: { marginPct: p.marginPct },
  });
  revalidateTag(ANALYTICS_CACHE_TAG, "max");
}

export type GenerateForecastResult =
  | {
      ok: true;
      branchCount: number;
      groups: GroupForecastResult[];
      days: Record<number, Record<string, ForecastDayCell>>;
    }
  | { ok: false; error: string };

// Barcha filiallar uchun prognoz (filiallar 2 tadan, har biri 3 bo'lim ketma-ket)
export async function generateForecastAllAction(input: {
  year: number;
  month: number;
}): Promise<GenerateForecastResult> {
  try {
    await requireAdmin();
    const branches = await prisma.branch.findMany({ select: { id: true }, orderBy: { sortOrder: "asc" } });
    // To'liq parallel EMAS: har filial bir nechta Claude so'rovi + DB tranzaksiya
    // ochadi — hammasi birga API rate-limit va Neon pool'ni (max 5) bosib qo'yadi.
    const LIMIT = 2;
    const all: Awaited<ReturnType<typeof generateForecast>>[] = [];
    for (let i = 0; i < branches.length; i += LIMIT) {
      const chunk = branches.slice(i, i + LIMIT);
      all.push(...(await Promise.all(chunk.map((b) => generateForecast(b.id, input.year, input.month)))));
    }
    const days = await getForecastDays(input.year, input.month);
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, branchCount: branches.length, groups: all.flat(), days };
  } catch (e) {
    return actionError(e, "rejalar");
  }
}

export type SetForecastDayResult =
  | { ok: true; days: Record<string, ForecastDayCell> }
  | { ok: false; error: string };

const fcDaySchema = z.object({
  branchId: id, year: yearZ, month: monthZ,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri"),
  amount: z.coerce.number().min(0).max(1e15).nullable(),
});

// Kunlik prognozni qo'lda tahrirlash (amount=null → qulfdan chiqarish)
export async function setForecastDayAction(input: z.input<typeof fcDaySchema>): Promise<SetForecastDayResult> {
  try {
    await requireAdmin();
    const p = fcDaySchema.parse(input);
    const days = await applyForecastDayEdit(p.branchId, p.year, p.month, p.date, p.amount);
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, days };
  } catch (e) {
    return actionError(e, "rejalar");
  }
}

export type ClearResult = { ok: true; count: number } | { ok: false; error: string };

// Tanlangan oy uchun barcha sotuv rejalarini tozalaydi (barcha filial × subkat).
export async function clearSalesPlansAction(input: {
  year: number;
  month: number;
}): Promise<ClearResult> {
  try {
    await requireAdmin();
    const res = await prisma.salesPlan.deleteMany({ where: { year: input.year, month: input.month } });
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, count: res.count };
  } catch (e) {
    return actionError(e, "rejalar");
  }
}

// Barcha marja rejalarini tozalaydi (marja vaqtsiz — davr yo'q).
export async function clearMarginPlansAction(): Promise<ClearResult> {
  try {
    await requireAdmin();
    const res = await prisma.marginPlan.deleteMany({});
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, count: res.count };
  } catch (e) {
    return actionError(e, "rejalar");
  }
}

// Tanlangan oy prognozini tozalaydi (kunlik + egri chiziq + jurnal).
export async function clearForecastAction(input: {
  year: number;
  month: number;
}): Promise<ClearResult> {
  try {
    await requireAdmin();
    const [days] = await prisma.$transaction([
      prisma.forecastDay.deleteMany({ where: { year: input.year, month: input.month } }),
      prisma.forecastCurve.deleteMany({ where: { year: input.year, month: input.month } }),
      prisma.forecastRun.deleteMany({ where: { year: input.year, month: input.month } }),
    ]);
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, count: days.count };
  } catch (e) {
    return actionError(e, "rejalar");
  }
}
