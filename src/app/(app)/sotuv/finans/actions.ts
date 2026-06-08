"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminTier } from "@/lib/roles";
import { actionError } from "@/lib/action-error";

// Harajat kiritish/o'chirish — SYSTEM_ADMIN va ADMIN.
async function requireExpenseEditor() {
  const session = await auth();
  if (!session?.user || !isAdminTier(session.user.role)) {
    throw new Error("Ruxsat yo'q");
  }
  return session.user;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Nom kiriting").max(200),
  quantity: z.coerce.number().positive("Miqdor > 0"),
  unitPrice: z.coerce.number().nonnegative("Narx manfiy bo'lmasin"),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri"),
});

export async function createExpenseAction(
  input: z.input<typeof createSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireExpenseEditor();
    const p = createSchema.parse(input);
    const amount = Math.round(p.quantity * p.unitPrice * 100) / 100;
    await prisma.expense.create({
      data: {
        name: p.name,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        amount,
        spentAt: new Date(p.spentAt + "T00:00:00.000Z"),
        createdById: Number(user.id),
      },
    });
    revalidatePath("/sotuv/finans");
    return { ok: true };
  } catch (err) {
    return actionError(err, "finans");
  }
}

export async function deleteExpenseAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireExpenseEditor();
    const uid = z.coerce.number().int().positive().parse(id);
    // Soft-delete — moliyaviy yozuv butunlay o'chmaydi
    await prisma.expense.update({ where: { id: uid }, data: { deletedAt: new Date() } });
    revalidatePath("/sotuv/finans");
    return { ok: true };
  } catch (err) {
    return actionError(err, "finans");
  }
}
