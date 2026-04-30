"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

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

    let saved = 0;
    await prisma.$transaction(async (tx) => {
      for (const p of parsed.plans) {
        if (p.amount === 0) {
          // 0 bo'lsa o'chirib tashlaymiz
          await tx.monthlyPlan
            .delete({
              where: {
                branchId_year_month_categoryId: {
                  branchId: parsed.branchId,
                  year: parsed.year,
                  month: parsed.month,
                  categoryId: p.categoryId,
                },
              },
            })
            .catch(() => null);
          continue;
        }
        await tx.monthlyPlan.upsert({
          where: {
            branchId_year_month_categoryId: {
              branchId: parsed.branchId,
              year: parsed.year,
              month: parsed.month,
              categoryId: p.categoryId,
            },
          },
          create: {
            branchId: parsed.branchId,
            year: parsed.year,
            month: parsed.month,
            categoryId: p.categoryId,
            planAmount: new Prisma.Decimal(p.amount),
          },
          update: {
            planAmount: new Prisma.Decimal(p.amount),
          },
        });
        saved++;
      }
    });

    revalidatePath("/admin/plans");
    revalidatePath("/dashboard");
    return { ok: true, saved };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}
