"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

const schema = z.object({
  branchId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  plans: z.array(
    z.object({
      categoryId: z.coerce.number().int().positive(),
      amount: z.coerce.number().nonnegative(),
    })
  ),
});

export async function savePlansAction(
  input: z.input<typeof schema>
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const parsed = schema.parse(input);

    const nonZero = parsed.plans.filter((p) => p.amount > 0);
    const zero = parsed.plans.filter((p) => p.amount === 0);

    if (nonZero.length > 0) {
      const values = nonZero.map((p) =>
        Prisma.sql`(${parsed.branchId}, ${parsed.year}, ${parsed.month}, ${p.categoryId}, ${new Prisma.Decimal(p.amount)})`
      );
      await prisma.$executeRaw`
        INSERT INTO "MonthlyPlan" ("branchId", "year", "month", "categoryId", "planAmount")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("branchId", "year", "month", "categoryId")
        DO UPDATE SET "planAmount" = EXCLUDED."planAmount"
      `;
    }

    // N+1 o'rniga bitta deleteMany — loop'dagi har bir p uchun alohida query yo'q
    if (zero.length > 0) {
      await prisma.monthlyPlan.deleteMany({
        where: {
          branchId: parsed.branchId,
          year: parsed.year,
          month: parsed.month,
          categoryId: { in: zero.map((p) => p.categoryId) },
        },
      });
    }

    revalidatePath("/admin/plans");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true, saved: nonZero.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}

export async function loadPrevMonthPlansAction(
  branchId: number,
  year: number,
  month: number
): Promise<{ ok: true; data: { categoryId: number; amount: number }[] } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const plans = await prisma.monthlyPlan.findMany({
      where: { branchId, year: prevYear, month: prevMonth },
    });
    return {
      ok: true,
      data: plans.map((p) => ({ categoryId: p.categoryId, amount: Number(p.planAmount) })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}
