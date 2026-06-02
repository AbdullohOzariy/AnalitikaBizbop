"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCatManagerOrAdmin } from "@/lib/auth-helpers";
import { vozvratStatusYangila } from "@/lib/spisaniya/db";
import { vozvratStatusXabar } from "@/lib/spisaniya/notify";

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

    // In-process: bizbop bazasiga to'g'ridan-to'g'ri yozamiz (eski HTTP bot API o'rniga).
    const updated = await vozvratStatusYangila(p.id, p.status, p.firmaJavob ?? null, userName);
    if (!updated) return { ok: false, error: "Vozvrat yozuvi topilmadi." };

    // Guruhga xabar — fonda (status yangilanishini bloklamaydi).
    void vozvratStatusXabar(updated.tovar, updated.firma, p.status, userName).catch(() => {});

    revalidatePath("/chiqim/vozvrat");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Xato.";
    if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
    return { ok: false, error: msg };
  }
}
