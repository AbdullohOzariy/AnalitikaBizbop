"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCatManagerOrAdmin } from "@/lib/auth-helpers";
import {
  vozvratHolatYangila,
  vozvratChiqimgaOtkaz,
  TUR_LABEL,
} from "@/lib/spisaniya/db";
import { vozvratHolatGuruhXabar } from "@/lib/spisaniya/notify";

const RP = "/chiqim/vozvratlar";
type Result = { ok: true } | { ok: false; error: string };

function xato(err: unknown): Result {
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  return { ok: false, error: msg };
}

const holatSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["xabar_berildi", "yuborildi", "qaytarildi", "qaytarilmadi"]),
  qaytarilmadiSabab: z.string().trim().max(500).optional(),
});

export async function vozvratHolatAction(input: {
  id: number;
  status: string;
  qaytarilmadiSabab?: string;
}): Promise<Result> {
  try {
    const user = await requireCatManagerOrAdmin();
    const p = holatSchema.parse(input);
    if (p.status === "qaytarilmadi" && !p.qaytarilmadiSabab?.trim())
      return { ok: false, error: "Qaytarilmadi sababi kiritilishi shart." };

    const updated = await vozvratHolatYangila(p.id, p.status, p.qaytarilmadiSabab ?? null);
    if (!updated) return { ok: false, error: "Vozvrat topilmadi yoki allaqachon o'tkazilgan." };

    const ism = user.name?.trim() || user.email || "Admin";
    void vozvratHolatGuruhXabar(updated, ism).catch(() => {});
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

const otkazSchema = z.object({
  id: z.coerce.number().int().positive(),
  tur: z.enum(["spisaniya", "kafe", "ovqatlanish", "ichki_sotuv"]),
  sabab: z.string().trim().max(255).optional(),
});

export async function vozvratOtkazAction(input: {
  id: number;
  tur: string;
  sabab?: string;
}): Promise<Result> {
  try {
    const user = await requireCatManagerOrAdmin();
    const p = otkazSchema.parse(input);
    const res = await vozvratChiqimgaOtkaz(p.id, p.tur, p.sabab ?? null);
    if (!res) return { ok: false, error: "Vozvrat topilmadi yoki allaqachon o'tkazilgan." };

    const ism = user.name?.trim() || user.email || "Admin";
    void vozvratHolatGuruhXabar(
      res.vozvrat,
      ism,
      `📥 Hisobdan chiqarishga o'tkazildi: ${TUR_LABEL[p.tur] ?? p.tur}`
    ).catch(() => {});
    revalidatePath(RP);
    revalidatePath("/chiqim");
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}
