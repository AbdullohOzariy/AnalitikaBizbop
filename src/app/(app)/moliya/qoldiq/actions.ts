"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { canEnterCash } from "@/lib/roles";
import { parseDateParam } from "@/lib/date";

const PATH = "/moliya/qoldiq";

async function requireCash() {
  const session = await auth();
  if (!session?.user || !canEnterCash(session.user.roles)) throw new AuthorizationError();
  return session.user;
}

const openingSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri."),
  amount: z.coerce.number().min(0, "Sanalgan summa manfiy bo'lmaydi.").max(1e15),
  note: z.string().trim().max(300).optional(),
  /** true — shu sanadan boshlab qoldiq ISHONCHLI deb belgilanadi. */
  trust: z.boolean().optional(),
});

/**
 * Davr boshi qoldig'ini kiritish (fizik sanash natijasi).
 * Bu — modulning boshlanish nuqtasi: usiz meros ishonchsizligi tuzatilmaydi.
 */
export async function davrBoshiSaqlaAction(input: {
  accountId: number;
  onDate: string;
  amount: number;
  note?: string;
  trust?: boolean;
}): Promise<ActionResult> {
  try {
    await requireCash();
    const d = openingSchema.parse(input);
    const onDate = parseDateParam(d.onDate);
    if (!onDate) return { ok: false, error: "Sana noto'g'ri." };

    await prisma.$transaction(async (tx) => {
      await tx.cashAccountOpening.upsert({
        where: { accountId_onDate: { accountId: d.accountId, onDate } },
        create: { accountId: d.accountId, onDate, amount: d.amount, note: d.note || null },
        update: { amount: d.amount, note: d.note || null },
      });
      if (d.trust) {
        // trustedFrom faqat OLDINGA suriladi: eskiroq sanani qo'yish tarixni
        // "ishonchli" deb ko'rsatib qo'yardi.
        const acc = await tx.cashAccount.findUnique({
          where: { id: d.accountId },
          select: { trustedFrom: true },
        });
        if (!acc?.trustedFrom || acc.trustedFrom < onDate) {
          await tx.cashAccount.update({ where: { id: d.accountId }, data: { trustedFrom: onDate } });
        }
      }
    });

    revalidatePath(PATH);
    revalidatePath("/moliya/kassa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:davr-boshi");
  }
}

export async function davrBoshiOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireCash();
    await prisma.cashAccountOpening.delete({
      where: { id: z.coerce.number().int().positive().parse(id) },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:davr-boshi-ochir");
  }
}
