"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { yozuvYangila, yozuvOchir } from "@/lib/spisaniya/db";

type Result = { ok: true } | { ok: false; error: string };

function xato(err: unknown): Result {
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  // Postgres unique violation / FK violation — tushunarli xabar
  if (msg.includes("duplicate key") || msg.includes("23505"))
    return { ok: false, error: "Bunday yozuv allaqachon mavjud." };
  if (msg.includes("foreign key") || msg.includes("23503"))
    return { ok: false, error: "Bu yozuvga bog'liq ma'lumotlar bor — o'chirib bo'lmaydi." };
  return { ok: false, error: msg };
}

// revalidate qilinadigan yo'llar
const PATHS = ["/chiqim", "/chiqim/statistika", "/chiqim/kategoriyalar"] as const;

const yangilaSchema = z.object({
  id: z.coerce.number().int().positive(),
  tur: z
    .enum(["spisaniya", "vozvrat", "kafe", "ovqatlanish", "ichki_sotuv"])
    .optional(),
  tovar: z.string().trim().min(1).max(255).optional(),
  miqdor: z.coerce.number().nonnegative().optional(),
  birlik: z.string().trim().max(20).optional(),
  summa: z.coerce.number().nonnegative().optional(),
  sabab: z.string().trim().max(500).optional(),
  filial: z.string().trim().max(100).optional(),
  kategoriya: z.string().trim().max(100).optional(),
});

export async function chiqimYozuvYangilaAction(input: {
  id: number;
  tur?: string;
  tovar?: string;
  miqdor?: number;
  birlik?: string;
  summa?: number;
  sabab?: string;
  filial?: string;
  kategoriya?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = yangilaSchema.parse(input);
    const updated = await yozuvYangila(p.id, {
      tur: p.tur,
      tovar: p.tovar,
      miqdor: p.miqdor,
      birlik: p.birlik,
      summa: p.summa,
      // bo'sh satr → null
      sabab: p.sabab !== undefined ? (p.sabab || null) : undefined,
      filial: p.filial,
      kategoriya: p.kategoriya !== undefined ? (p.kategoriya || null) : undefined,
    });
    if (!updated) return { ok: false, error: "Yozuv topilmadi yoki o'zgartirish yo'q." };
    for (const path of PATHS) revalidatePath(path);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function chiqimYozuvOchirAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const validId = z.coerce.number().int().positive().parse(id);
    await yozuvOchir(validId);
    for (const path of PATHS) revalidatePath(path);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}
