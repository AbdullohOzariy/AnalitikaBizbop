"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { canSeeChiqim } from "@/lib/roles";
import { chiqimByKategoriyaTovar } from "@/lib/spisaniya/db";

const schema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD"),
  filial: z.string().trim().max(200).optional(),
  kategoriya: z.string().max(300),
});

export type TovarRow = { tovar: string; count: number; summa: number; miqdor: number };

/** Kategoriya ichidagi tovarlar (drill-down) — Statistika sahifasi uchun. */
export async function chiqimKategoriyaTovarlarAction(
  input: z.input<typeof schema>
): Promise<{ ok: true; rows: TovarRow[] } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || !canSeeChiqim(session.user.roles)) return { ok: false, error: "Ruxsat yo'q." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Noto'g'ri parametr." };
  const p = parsed.data;
  const start = new Date(p.start + "T00:00:00.000Z");
  const end = new Date(p.end + "T00:00:00.000Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { ok: false, error: "Sana xato." };
  const rows = await chiqimByKategoriyaTovar({ start, end }, p.filial || undefined, p.kategoriya);
  return { ok: true, rows };
}
