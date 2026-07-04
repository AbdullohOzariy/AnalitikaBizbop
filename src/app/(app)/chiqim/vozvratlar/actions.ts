"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  vozvratHolatYangila,
  vozvratChiqimgaOtkaz,
  vozvratYangila,
  vozvratOchir,
  vozvratlarBatchYarat,
  aktivFilialNomlari,
  TUR_LABEL,
  type VozvratKirim,
} from "@/lib/spisaniya/db";
import { parseVozvratRows } from "@/lib/spisaniya/vozvrat-import";
import { vozvratHolatGuruhXabar } from "@/lib/spisaniya/notify";

const RP = "/chiqim/vozvratlar";
type Result = { ok: true } | { ok: false; error: string };

function xato(err: unknown): Result {
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  console.error("[vozvrat]", err);
  return { ok: false, error: "Amal bajarilmadi. Birozdan so'ng qayta urinib ko'ring." };
}

const holatSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["saqlash_xonasida", "yuborildi", "qaytarildi"]),
  qaytarilmadiSabab: z.string().trim().max(500).optional(), // eski maydon — endi ishlatilmaydi
});

export async function vozvratHolatAction(input: {
  id: number;
  status: string;
  qaytarilmadiSabab?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = holatSchema.parse(input);
    const updated = await vozvratHolatYangila(p.id, p.status, null);
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
  status: z.enum(["saqlash_xonasida", "yuborildi", "qaytarildi"]).optional(),
  qaytarilmadiSabab: z.string().trim().max(500).optional(), // eski — ishlatilmaydi
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

    const updated = await vozvratYangila(p.id, {
      tovar: p.tovar,
      miqdor: p.miqdor,
      birlik: p.birlik,
      summa: p.summa,
      sabab: p.sabab === undefined ? undefined : p.sabab || null,
      filial: p.filial,
      yonalish: p.yonalish,
      // asosiy_filialga o'tkazilsa yetkazib beruvchi tozalanadi
      taminotchi:
        p.yonalish === "asosiy_filial"
          ? null
          : p.taminotchi === undefined
            ? undefined
            : p.taminotchi || null,
      status: p.status,
      // status berilganda eski "qaytarilmadi sababi" tozalanadi (status endi faqat 3 ta)
      qaytarilmadi_sabab: p.status === undefined ? undefined : null,
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

// ─── Excel import (vozvratlar ommaviy qo'shish) ────────────────────────────────
/**
 * Excel/CSV (Tovar, Miqdor, Summa, Filial [, Birlik, Sabab, Yo'nalish, Ta'minotchi]) →
 * har qator yangi vozvrat (status "xabar berildi"). Filial bot filiallariga mos
 * kelmasa — o'sha qator o'tkazib yuboriladi. Guruhga xabar yuborilmaydi.
 */
export async function importVozvratlarAction(
  formData: FormData
): Promise<
  { ok: true; created: number; unmatched: number; unmatchedSample: string[]; rows: number } | { ok: false; error: string }
> {
  try {
    const user = await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Fayl topilmadi." };
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { ok: false, error: "Bo'sh fayl." };
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
    const parsed = parseVozvratRows(aoa);
    if (parsed.length === 0) return { ok: false, error: "Faylda vozvrat qatorlari topilmadi (ustunlar: Tovar, Miqdor, Summa, Filial)." };

    const branches = await aktivFilialNomlari();
    const norm = (s: string) => s.trim().toLowerCase();
    const branchByNorm = new Map(branches.map((b) => [norm(b), b]));
    const ism = user.name?.trim() || user.email || "Admin";

    const unmatched = new Set<string>();
    const toCreate: VozvratKirim[] = [];
    for (const r of parsed) {
      const fb = branchByNorm.get(norm(r.filial));
      if (!fb) { unmatched.add(r.filial); continue; }
      toCreate.push({
        tovar: r.tovar, miqdor: r.miqdor, summa: r.summa, filial: fb,
        birlik: r.birlik ?? "dona", sabab: r.sabab ?? null,
        yonalish: r.yonalish ?? "asosiy_filial",
        taminotchi: r.yonalish === "taminotchi" ? (r.taminotchi ?? null) : null,
        xodim_ism: ism, xodim_id: 0, status: "saqlash_xonasida",
      });
    }
    // Bitta tranzaksiyada batch (N+1 emas); yarim import qolmaydi.
    const created = await vozvratlarBatchYarat(toCreate);
    revalidatePath(RP);
    return { ok: true, created, unmatched: unmatched.size, unmatchedSample: [...unmatched].slice(0, 8), rows: parsed.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}
