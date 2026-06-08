"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import {
  generateForecast,
  applyForecastDayEdit,
  getForecastDays,
  type GroupForecastResult,
  type ForecastDayCell,
} from "@/lib/forecast";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "SYSTEM_ADMIN") throw new Error("Ruxsat yo'q");
}

export async function upsertSalesPlan(input: {
  branchId: number;
  categoryId: number;
  year: number;
  month: number;
  amount: number;
}) {
  await requireAdmin();
  await prisma.salesPlan.upsert({
    where: {
      branchId_categoryId_year_month: {
        branchId: input.branchId,
        categoryId: input.categoryId,
        year: input.year,
        month: input.month,
      },
    },
    create: {
      branchId: input.branchId,
      categoryId: input.categoryId,
      year: input.year,
      month: input.month,
      amount: input.amount,
    },
    update: { amount: input.amount },
  });
  // Reja o'zgardi → dashboard prognozi qayta hisoblansin (egri chiziq o'zgarmaydi,
  // faqat kattalik qayta masshtablanadi).
  revalidateTag(ANALYTICS_CACHE_TAG, "max");
}

export async function upsertMarginPlan(input: {
  branchId: number;
  categoryId: number;
  marginPct: number;
}) {
  await requireAdmin();
  await prisma.marginPlan.upsert({
    where: {
      branchId_categoryId: {
        branchId: input.branchId,
        categoryId: input.categoryId,
      },
    },
    create: {
      branchId: input.branchId,
      categoryId: input.categoryId,
      marginPct: input.marginPct,
    },
    update: { marginPct: input.marginPct },
  });
}

export type GenerateForecastResult =
  | {
      ok: true;
      branchCount: number;
      groups: GroupForecastResult[];
      days: Record<number, Record<string, ForecastDayCell>>;
    }
  | { ok: false; error: string };

// Barcha filiallar uchun prognoz (filiallar parallel, har biri 3 bo'lim ketma-ket)
export async function generateForecastAllAction(input: {
  year: number;
  month: number;
}): Promise<GenerateForecastResult> {
  try {
    await requireAdmin();
    const branches = await prisma.branch.findMany({ select: { id: true }, orderBy: { sortOrder: "asc" } });
    const all = await Promise.all(
      branches.map((b) => generateForecast(b.id, input.year, input.month))
    );
    const days = await getForecastDays(input.year, input.month);
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, branchCount: branches.length, groups: all.flat(), days };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}

export type SetForecastDayResult =
  | { ok: true; days: Record<string, ForecastDayCell> }
  | { ok: false; error: string };

// Kunlik prognozni qo'lda tahrirlash (amount=null → qulfdan chiqarish)
export async function setForecastDayAction(input: {
  branchId: number;
  year: number;
  month: number;
  date: string;
  amount: number | null;
}): Promise<SetForecastDayResult> {
  try {
    await requireAdmin();
    const days = await applyForecastDayEdit(
      input.branchId,
      input.year,
      input.month,
      input.date,
      input.amount
    );
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, days };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}
