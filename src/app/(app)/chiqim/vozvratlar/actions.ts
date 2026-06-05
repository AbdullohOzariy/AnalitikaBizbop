"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  vozvratHolatYangila,
  vozvratChiqimgaOtkaz,
  vozvratYangila,
  vozvratOchir,
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
  status: z.enum(["xabar_berildi", "saqlash_xonasida", "yuborildi", "qaytarildi", "qaytarilmadi"]),
  qaytarilmadiSabab: z.string().trim().max(500).optional(),
});

export async function vozvratHolatAction(input: {
  id: number;
  status: string;
  qaytarilmadiSabab?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = holatSchema.parse(input);
    if (p.status === "qaytarilmadi" && !p.qaytarilmadiSabab?.trim())
      return { ok: false, error: "Qaytarilmadi sababi kiritilishi shart." };

    const updated = await vozvratHolatYangila(p.id, p.status, p.qaytarilmadiSabab ?? null);
    if (!updated) return { ok: false, error: "Vozvrat topilmadi yoki allaqachon o'tkazilgan." };

    // Status o'zgarganda guruhga xabar YUBORILMAYDI (faqat yangi vozvrat yaratilganda).
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
    const user = await requireAdmin();
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

// ─── To'liq tahrirlash / o'chirish (ro'yxat ko'rinishi, faqat admin) ───────────
const yangilaSchema = z.object({
  id: z.coerce.number().int().positive(),
  tovar: z.string().trim().min(1, "Tovar nomi kerak").max(255).optional(),
  miqdor: z.coerce.number().nonnegative().optional(),
  birlik: z.string().trim().max(20).optional(),
  summa: z.coerce.number().nonnegative().optional(),
  sabab: z.string().trim().max(255).optional(),
  filial: z.string().trim().min(1).max(100).optional(),
  yonalish: z.enum(["asosiy_filial", "taminotchi"]).optional(),
  taminotchi: z.string().trim().max(255).optional(),
  status: z.enum(["xabar_berildi", "saqlash_xonasida", "yuborildi", "qaytarildi", "qaytarilmadi"]).optional(),
  qaytarilmadiSabab: z.string().trim().max(500).optional(),
});

export async function vozvratYangilaAction(input: {
  id: number;
  tovar?: string;
  miqdor?: number;
  birlik?: string;
  summa?: number;
  sabab?: string;
  filial?: string;
  yonalish?: string;
  taminotchi?: string;
  status?: string;
  qaytarilmadiSabab?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = yangilaSchema.parse(input);
    if (p.status === "qaytarilmadi" && p.qaytarilmadiSabab !== undefined && !p.qaytarilmadiSabab.trim())
      return { ok: false, error: "Qaytarilmadi sababi kiritilishi shart." };

    const updated = await vozvratYangila(p.id, {
      tovar: p.tovar,
      miqdor: p.miqdor,
      birlik: p.birlik,
      summa: p.summa,
      sabab: p.sabab === undefined ? undefined : p.sabab || null,
      filial: p.filial,
      yonalish: p.yonalish,
      // asosiy_filialga o'tkazilsa ta'minotchi tozalanadi
      taminotchi:
        p.yonalish === "asosiy_filial"
          ? null
          : p.taminotchi === undefined
            ? undefined
            : p.taminotchi || null,
      status: p.status,
      // status berilganda: qaytarilmadi bo'lsa sabab, aks holda null
      qaytarilmadi_sabab:
        p.status === undefined
          ? undefined
          : p.status === "qaytarilmadi"
            ? p.qaytarilmadiSabab?.trim() || null
            : null,
    });
    if (!updated) return { ok: false, error: "Vozvrat topilmadi yoki allaqachon o'tkazilgan." };

    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function vozvratOchirAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    await vozvratOchir(z.coerce.number().int().positive().parse(id));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}
