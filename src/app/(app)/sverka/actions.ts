"use server";

/** Sverka boshqaruvi (yozuv o'chirish, xodim ro'yxati) — SYSTEM_ADMIN va SUPPLYCHAIN. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isSystemAdmin, isSupplyChain } from "@/lib/roles";
import { actionError } from "@/lib/action-error";

export async function deleteSverkaAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user || (!isSystemAdmin(session.user.role) && !isSupplyChain(session.user.role))) {
      throw new Error("Ruxsat yo'q");
    }
    const sid = z.coerce.number().int().positive().parse(id);
    await prisma.sverkaRecord.delete({ where: { id: sid } });
    revalidatePath("/sverka");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteSverka");
  }
}


async function requireSverkaManager() {
  const session = await auth();
  if (!session?.user || (!isSystemAdmin(session.user.role) && !isSupplyChain(session.user.role))) {
    throw new Error("Ruxsat yo'q");
  }
  return session.user;
}

const xodimSchema = z.object({
  tgUserId: z.coerce.number().int().positive("Telegram ID musbat son bo'lishi kerak"),
  ism: z.string().trim().max(120).optional(),
});

/** Sverka roli berish — xodim Telegram ID orqali (bot /start'da ID ko'rinadi). */
export async function addSverkaXodimAction(
  input: z.input<typeof xodimSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSverkaManager();
    const p = xodimSchema.parse(input);
    await prisma.sverkaXodim.upsert({
      where: { tgUserId: BigInt(p.tgUserId) },
      create: { tgUserId: BigInt(p.tgUserId), ism: p.ism || null },
      update: { ism: p.ism || null },
    });
    revalidatePath("/sverka");
    return { ok: true };
  } catch (err) {
    return actionError(err, "addSverkaXodim");
  }
}

export async function deleteSverkaXodimAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSverkaManager();
    const xid = z.coerce.number().int().positive().parse(id);
    await prisma.sverkaXodim.delete({ where: { id: xid } });
    revalidatePath("/sverka");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteSverkaXodim");
  }
}
