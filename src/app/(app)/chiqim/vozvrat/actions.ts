"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCatManagerOrAdmin } from "@/lib/auth-helpers";
import { patchVozvratStatus } from "@/lib/spisaniya/bot-api";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["kutilmoqda", "jarayonda", "bajarildi", "rad_etildi"]),
  firmaJavob: z.string().trim().max(500).optional(),
});

export async function updateVozvratStatusAction(input: {
  id: number;
  status: string;
  firmaJavob?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireCatManagerOrAdmin();
    const p = schema.parse(input);
    const userName = user.name?.trim() || user.email || "Analitika";
    const res = await patchVozvratStatus(p.id, p.status, p.firmaJavob ?? null, userName);
    if (!res.ok) return res;
    revalidatePath("/chiqim/vozvrat");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Xato.";
    if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
    return { ok: false, error: msg };
  }
}
