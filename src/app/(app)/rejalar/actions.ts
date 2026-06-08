"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
