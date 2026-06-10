"use server";

/** Anketa boshqaruvi (Tizim) — maydonlar CRUD + javoblar holati. SYSTEM_ADMIN. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

const fieldSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  section: z.string().trim().min(1, "Bo'lim kerak").max(120),
  label: z.string().trim().min(1, "Savol matni kerak").max(500),
  type: z.enum(["text", "textarea", "number", "yesno", "consent"]),
  required: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  active: z.boolean(),
});

export async function saveAnketaFieldAction(
  input: z.input<typeof fieldSchema>
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const p = fieldSchema.parse(input);
    const data = {
      section: p.section, label: p.label, type: p.type,
      required: p.required, sortOrder: p.sortOrder, active: p.active,
    };
    const saved = p.id
      ? await prisma.anketaField.update({ where: { id: p.id }, data })
      : await prisma.anketaField.create({ data });
    revalidatePath("/admin/anketa");
    revalidatePath("/anketa");
    return { ok: true, id: saved.id };
  } catch (err) {
    return actionError(err, "saveAnketaField");
  }
}

export async function deleteAnketaFieldAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const fid = z.coerce.number().int().positive().parse(id);
    // Javoblar JSON'da qoladi (field o'chsa ham tarixiy javob ko'rinadi — label saqlanmaydi,
    // shuning uchun odatda o'chirish o'rniga "active=false" tavsiya qilinadi)
    await prisma.anketaField.delete({ where: { id: fid } });
    revalidatePath("/admin/anketa");
    revalidatePath("/anketa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteAnketaField");
  }
}

export async function setAnketaStatusAction(
  id: number,
  status: "NEW" | "REVIEWED"
): Promise<Result> {
  try {
    await requireAdmin();
    const sid = z.coerce.number().int().positive().parse(id);
    await prisma.anketaSubmission.update({ where: { id: sid }, data: { status } });
    revalidatePath("/admin/anketa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "setAnketaStatus");
  }
}

export async function deleteAnketaSubmissionAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const sid = z.coerce.number().int().positive().parse(id);
    await prisma.anketaSubmission.delete({ where: { id: sid } });
    revalidatePath("/admin/anketa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteAnketaSubmission");
  }
}
