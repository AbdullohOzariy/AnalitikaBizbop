"use server";

/** Sverka yozuvini o'chirish — SYSTEM_ADMIN va SUPPLYCHAIN. */
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
