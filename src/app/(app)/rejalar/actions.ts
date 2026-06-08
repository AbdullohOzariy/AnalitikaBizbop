"use server";

import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { generateForecast, type GroupForecastResult } from "@/lib/forecast";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") throw new Error("Ruxsat yo'q");
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
  | { ok: true; groups: GroupForecastResult[] }
  | { ok: false; error: string };

export async function generateForecastAction(input: {
  branchId: number;
  year: number;
  month: number;
}): Promise<GenerateForecastResult> {
  try {
    await requireAdmin();
    const groups = await generateForecast(input.branchId, input.year, input.month);
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}
