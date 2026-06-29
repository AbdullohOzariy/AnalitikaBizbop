"use server";

/** Anketa boshqaruvi (Tizim) — bo'limlar + maydonlar CRUD + javoblar holati. SYSTEM_ADMIN. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { auth } from "@/auth";
import { canReviewAnketa } from "@/lib/roles";
import { actionError } from "@/lib/action-error";

// Tasdiqlash — Bo'lim boshlig'i (ADMIN), Supplychain va SYSTEM_ADMIN vazifasi
async function requireAnketaReviewer() {
  const session = await auth();
  if (!session?.user || !canReviewAnketa(session.user.roles)) throw new Error("Ruxsat yo'q");
  return session.user;
}

type Result = { ok: true } | { ok: false; error: string };

function revalidateAnketa() {
  revalidatePath("/admin/anketa");
  revalidatePath("/anketa");
}

// ─── Bo'limlar (AnketaSection) ─────────────────────────────────────────────────

const titleSchema = z.string().trim().min(1, "Bo'lim nomi kerak").max(120);

/** Bo'sh bo'lim qo'shish (ro'yxat oxiriga). */
export async function addAnketaSectionAction(
  input: { title: string }
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const title = titleSchema.parse(input.title);
    const agg = await prisma.anketaSection.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.anketaSection.create({
      data: { title, sortOrder: (agg._max.sortOrder ?? -10) + 10 },
    });
    revalidateAnketa();
    return { ok: true, id: created.id };
  } catch (err) {
    return actionError(err, "addAnketaSection");
  }
}

const renameSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: titleSchema,
});

/** Bo'lim nomini tahrirlash. */
export async function renameAnketaSectionAction(
  input: z.input<typeof renameSchema>
): Promise<Result> {
  try {
    await requireAdmin();
    const { id, title } = renameSchema.parse(input);
    await prisma.anketaSection.update({ where: { id }, data: { title } });
    revalidateAnketa();
    return { ok: true };
  } catch (err) {
    return actionError(err, "renameAnketaSection");
  }
}

/** Bo'limni o'chirish — ichidagi maydonlar ham cascade o'chadi. */
export async function deleteAnketaSectionAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const sid = z.coerce.number().int().positive().parse(id);
    await prisma.anketaSection.delete({ where: { id: sid } });
    revalidateAnketa();
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteAnketaSection");
  }
}

const moveSchema = z.object({
  id: z.coerce.number().int().positive(),
  dir: z.enum(["up", "down"]),
});

/**
 * Bo'limni yuqoriga/pastga ko'chirish. Yangi tartibda barcha bo'limlarni 0,10,20,…
 * qilib bitta bulk SQL bilan qayta raqamlaymiz (har qanday tartibsiz holatdan ham
 * to'g'ri chiqadi; ko'p statement'li $transaction Neon'da ishonchsiz edi).
 */
export async function moveAnketaSectionAction(
  input: z.input<typeof moveSchema>
): Promise<Result> {
  try {
    await requireAdmin();
    const { id, dir } = moveSchema.parse(input);
    const sections = await prisma.anketaSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return { ok: false, error: "Bo'lim topilmadi" };
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sections.length) return { ok: true }; // chekkada — harakatsiz
    [sections[idx], sections[swap]] = [sections[swap], sections[idx]];

    const vals = sections.map((s, i) => Prisma.sql`(${s.id}::int, ${i * 10}::int)`);
    await prisma.$executeRaw`
      UPDATE "AnketaSection" AS a SET "sortOrder" = v.so
      FROM (VALUES ${Prisma.join(vals)}) AS v(id, so)
      WHERE a.id = v.id
    `;
    revalidateAnketa();
    return { ok: true };
  } catch (err) {
    return actionError(err, "moveAnketaSection");
  }
}

// ─── Maydonlar (AnketaField) ────────────────────────────────────────────────────

const fieldSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  sectionId: z.coerce.number().int().positive(),
  label: z.string().trim().min(1, "Savol matni kerak").max(500),
  type: z.enum(["text", "textarea", "number", "yesno", "consent"]),
  required: z.boolean().default(false),
  // Berilmasa (yangi maydon yoki boshqa bo'limga ko'chish) — bo'lim oxiriga qo'shiladi
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  active: z.boolean().default(true),
});

/** Bo'lim oxiridagi sortOrder + 10 (bo'sh bo'limda 0). */
async function nextSortOrder(sectionId: number): Promise<number> {
  const agg = await prisma.anketaField.aggregate({
    where: { sectionId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -10) + 10;
}

export async function saveAnketaFieldAction(
  input: z.input<typeof fieldSchema>
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const p = fieldSchema.parse(input);

    const section = await prisma.anketaSection.findUnique({ where: { id: p.sectionId } });
    if (!section) return { ok: false, error: "Bo'lim topilmadi" };

    let sortOrder = p.sortOrder;
    if (p.id) {
      // Mavjud maydon boshqa bo'limga ko'chsa — yangi bo'lim oxiriga
      const existing = await prisma.anketaField.findUnique({
        where: { id: p.id },
        select: { sectionId: true },
      });
      if (existing && existing.sectionId !== p.sectionId) sortOrder = await nextSortOrder(p.sectionId);
    } else if (sortOrder === undefined) {
      sortOrder = await nextSortOrder(p.sectionId);
    }

    const data = {
      sectionId: p.sectionId, label: p.label, type: p.type,
      required: p.required, sortOrder: sortOrder ?? 0, active: p.active,
    };
    const saved = p.id
      ? await prisma.anketaField.update({ where: { id: p.id }, data })
      : await prisma.anketaField.create({ data });
    revalidateAnketa();
    return { ok: true, id: saved.id };
  } catch (err) {
    return actionError(err, "saveAnketaField");
  }
}

export async function deleteAnketaFieldAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const fid = z.coerce.number().int().positive().parse(id);
    // Javoblar JSON'da fieldId bo'yicha saqlanadi; maydon o'chsa tarixiy javob
    // SubmissionsList'da "o'chirilgan" sifatida ko'rinadi (odatda "active=false" afzal).
    await prisma.anketaField.delete({ where: { id: fid } });
    revalidateAnketa();
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteAnketaField");
  }
}

// ─── Javoblar (AnketaSubmission) ────────────────────────────────────────────────

export async function setAnketaStatusAction(
  id: number,
  status: "NEW" | "REVIEWED"
): Promise<Result> {
  try {
    await requireAnketaReviewer();
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
