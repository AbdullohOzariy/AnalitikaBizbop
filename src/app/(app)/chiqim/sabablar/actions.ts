"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { sababQosh, sababYangila, sababOchir } from "@/lib/spisaniya/db";

// sabablar RAW pg orqali saqlanadi (Prisma emas) — unique buzilishi P2002 emas, pg 23505.
// actionError bu kodni bilmaydi, shuning uchun uni bu yerda tushunarli xabarga aylantiramiz.
function xato(err: unknown): ActionResult {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message : "";
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("23505"))
    return { ok: false, error: "Bunday sabab allaqachon mavjud." };
  return actionError(err, "sabablar");
}

const PATH = "/chiqim/sabablar";

const nomiSchema = z
  .string()
  .trim()
  .min(1, "Sabab nomi bo'sh bo'lmasin.")
  .max(255, "Sabab nomi juda uzun (255 belgigacha).");

export async function sababQoshAction(nomi: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await sababQosh(nomiSchema.parse(nomi));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

const yangilaSchema = z.object({
  id: z.coerce.number().int().positive(),
  nomi: nomiSchema.optional(),
  faol: z.boolean().optional(),
  tartib: z.coerce.number().int().optional(),
});

export async function sababYangilaAction(input: {
  id: number;
  nomi?: string;
  faol?: boolean;
  tartib?: number;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const p = yangilaSchema.parse(input);
    const ok = await sababYangila(p.id, { nomi: p.nomi, faol: p.faol, tartib: p.tartib });
    if (!ok) return { ok: false, error: "Sabab topilmadi yoki o'zgartirish yo'q." };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function sababOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    const validId = z.coerce.number().int().positive().parse(id);
    await sababOchir(validId);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}
