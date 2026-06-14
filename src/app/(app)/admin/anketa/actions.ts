"use server";

/** Anketa boshqaruvi (Tizim) — maydonlar CRUD + javoblar holati. SYSTEM_ADMIN. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { auth } from "@/auth";
import { canReviewAnketa } from "@/lib/roles";

// Tasdiqlash — Bo'lim boshlig'i (ADMIN), Supplychain va SYSTEM_ADMIN vazifasi
async function requireAnketaReviewer() {
  const session = await auth();
  if (!session?.user || !canReviewAnketa(session.user.role)) throw new Error("Ruxsat yo'q");
  return session.user;
}
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

const moveSectionSchema = z.object({
  section: z.string().trim().min(1),
  dir: z.enum(["up", "down"]),
});

/**
 * Bo'limni yuqoriga/pastga ko'chirish. Alohida "section" jadvali yo'q —
 * bo'lim tartibi maydonlar sortOrder'idan kelib chiqadi. Shuning uchun
 * barcha maydonlarni yangi bo'lim tartibida 0,10,20,… qilib qayta raqamlaymiz
 * (bo'lim ichidagi tartib saqlanadi). Faqat o'zgargan qatorlar yoziladi.
 */
export async function moveAnketaSectionAction(
  input: z.input<typeof moveSectionSchema>
): Promise<Result> {
  try {
    await requireAdmin();
    const { section, dir } = moveSectionSchema.parse(input);
    const fields = await prisma.anketaField.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, section: true, sortOrder: true },
    });

    // Joriy bo'lim tartibi (birinchi uchragan maydon bo'yicha)
    const order: string[] = [];
    for (const f of fields) if (!order.includes(f.section)) order.push(f.section);
    const idx = order.indexOf(section);
    if (idx === -1) return { ok: false, error: "Bo'lim topilmadi" };
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= order.length) return { ok: true }; // chekkada — harakatsiz
    [order[idx], order[swap]] = [order[swap], order[idx]];

    // Maydonlarni bo'lim bo'yicha guruhlash (joriy global tartibni saqlab)
    const bySection = new Map<string, { id: number; sortOrder: number }[]>();
    for (const f of fields) {
      const arr = bySection.get(f.section) ?? [];
      arr.push(f);
      bySection.set(f.section, arr);
    }

    // Yangi tartibda 0,10,20,… raqamlash, faqat o'zgarganlarni yangilash
    let running = 0;
    const changed: { id: number; sortOrder: number }[] = [];
    for (const sec of order) {
      for (const f of bySection.get(sec) ?? []) {
        if (f.sortOrder !== running) changed.push({ id: f.id, sortOrder: running });
        running += 10;
      }
    }
    if (changed.length) {
      // Bitta atomik SQL bilan ommaviy yangilash — N ta alohida UPDATE'li
      // $transaction o'rniga (Neon'da ko'p statement'li tranzaksiya ishonchsiz edi).
      // Naqsh: admin/upload/actions.ts. ${...}::int MAJBURIY — FROM (VALUES ...) da
      // tipsiz parametr text bo'lib qoladi va "integer = text" xatosi beradi.
      const vals = changed.map((u) => Prisma.sql`(${u.id}::int, ${u.sortOrder}::int)`);
      await prisma.$executeRaw`
        UPDATE "AnketaField" AS a SET "sortOrder" = v.so
        FROM (VALUES ${Prisma.join(vals)}) AS v(id, so)
        WHERE a.id = v.id
      `;
    }
    revalidatePath("/admin/anketa");
    revalidatePath("/anketa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "moveAnketaSection");
  }
}

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
