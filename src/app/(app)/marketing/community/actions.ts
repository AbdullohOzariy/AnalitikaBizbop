"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { TAG_COMMUNITY } from "@/lib/cache-tags";
import { analizQil } from "@/lib/community/analiz";
import { moslashtir } from "@/lib/community/match";
import { tahlilChatId } from "@/lib/community/sozlama";
import { bogla, kanonniOlYokiYarat, kanonlarniBirlashtir, ehtimoliyDublikatlar } from "@/lib/community/kanon";
import { yoqTafsilot, type TafsilotQator } from "@/lib/community/hisobot";
import { rateLimit } from "@/lib/spisaniya/rate-limit";

/**
 * Tahrirlash — HOZIRCHA FAQAT SYSTEM_ADMIN (`requireAdmin`).
 * AI xato qilishi tabiiy, shuning uchun har bir tuzatish alias sifatida MANUAL bo'lib
 * yoziladi: o'sha yozilish keyingi safar LLM'ga umuman bormaydi va qayta tahlilda ham
 * qo'lda kiritilgan qaror saqlanadi.
 */

const StatusSchema = z.enum(["YES", "NO", "UNANSWERED", "UNCLEAR"]);

/** So'rovni kanonga (va subkategoriyaga) qo'lda bog'lash. */
export async function tuzatKanon(input: {
  requestId: number;
  /** Mavjud kanon. `null` + `yangiNom` berilsa yangi kanon yaratiladi. */
  canonId: number | null;
  yangiNom?: string;
  categoryId: number | null;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const { requestId, canonId, yangiNom, categoryId } = z
      .object({
        requestId: z.number().int().positive(),
        canonId: z.number().int().positive().nullable(),
        yangiNom: z.string().trim().max(80).optional(),
        categoryId: z.number().int().positive().nullable(),
      })
      .parse(input);

    const req = await prisma.tgRequest.findUnique({
      where: { id: requestId },
      select: { productNorm: true },
    });
    if (!req?.productNorm) return { ok: false, error: "So'rovda mahsulot nomi yo'q." };

    let hedef = canonId;
    if (hedef == null) {
      if (!yangiNom) return { ok: false, error: "Kanon tanlang yoki yangi nom kiriting." };
      const yangi = await kanonniOlYokiYarat({
        name: yangiNom,
        categoryId,
        source: "MANUAL",
        synonym: req.productNorm,
      });
      hedef = yangi.id;
    } else if (categoryId != null) {
      await prisma.tgCanonProduct.update({
        where: { id: hedef },
        data: { categoryId, reviewedAt: new Date() },
      });
    }

    // Qo'lda tuzatish SHU YOZILISHDAGI BARCHA so'rovlarga qo'llanadi — operator
    // bir xil ishni "шафтоли"/"Shaftoli"/"saftoli" uchun uch marta qilmasin.
    await bogla({
      raw: req.productNorm,
      canonId: hedef,
      categoryId,
      source: "MANUAL",
      score: 1,
      hammaga: true,
    });

    revalidateTag(TAG_COMMUNITY, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "community/tuzatKanon");
  }
}

/** Holatni (HA/YO'Q/JAVOBSIZ) qo'lda tuzatish. */
export async function tuzatStatus(input: {
  requestId: number;
  status: string;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const { requestId, status } = z
      .object({ requestId: z.number().int().positive(), status: StatusSchema })
      .parse(input);

    await prisma.tgRequest.update({
      where: { id: requestId },
      data: { status, confidence: 1 }, // qo'lda tasdiqlangan — ishonch to'liq
    });
    revalidateTag(TAG_COMMUNITY, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "community/tuzatStatus");
  }
}

/** So'rovni statistikadan chiqarish (noto'g'ri tasniflangan bo'lsa). */
export async function sorovniOchir(requestId: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.tgRequest.delete({ where: { id: z.number().int().positive().parse(requestId) } });
    revalidateTag(TAG_COMMUNITY, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "community/sorovniOchir");
  }
}

export type KanonOpt = { id: number; name: string; categoryId: number | null; categoryName: string | null; hits: number };

/** Kanon reyestridan qidirish (tuzatish oynasi uchun). */
export async function kanonQidir(q: string): Promise<KanonOpt[]> {
  await requireAdmin();
  const term = q.trim();
  const rows = await prisma.tgCanonProduct.findMany({
    where: {
      mergedIntoId: null,
      ...(term.length >= 2 ? { name: { contains: term, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, name: true, categoryId: true, hits: true, category: { select: { name: true } } },
    take: 30,
    orderBy: term.length >= 2 ? { name: "asc" } : { hits: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    hits: r.hits,
  }));
}

export type KategoriyaOpt = { id: number; name: string; parent: string };

/** Subkategoriyalar ro'yxati (tuzatish oynasi uchun). */
export async function kategoriyalarRoyxati(): Promise<KategoriyaOpt[]> {
  await requireAdmin();
  const rows = await prisma.category.findMany({
    where: { parentId: { not: null } },
    select: { id: true, name: true, parent: { select: { name: true } } },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, parent: r.parent?.name ?? "" }));
}

/** "Yo'q davri" tafsiloti — accordion ochilganda chaqiriladi (oldindan yuklanmaydi). */
export async function yoqTafsilotAction(input: {
  canonId: number | null;
  normKey: string | null;
  from: string;
  to: string;
  branchId?: number | null;
}): Promise<{ ok: true; qatorlar: TafsilotQator[] } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const chatId = await tahlilChatId();
    if (chatId == null) return { ok: false, error: "Guruh topilmadi." };
    const qatorlar = await yoqTafsilot({
      chatId,
      from: input.from,
      to: input.to,
      canonId: input.canonId,
      normKey: input.normKey,
      branchId: input.branchId ?? null,
    });
    return { ok: true, qatorlar };
  } catch (err) {
    return actionError(err, "community/yoqTafsilot");
  }
}

/** Ikki kanonni birlashtirish — QAYTARIB BO'LMAYDI, jurnalga yoziladi. */
export async function kanonlarniBirlashtirAction(input: {
  sourceId: number;
  targetId: number;
}): Promise<ActionResult & { natija?: string }> {
  try {
    const user = await requireAdmin();
    const { sourceId, targetId } = z
      .object({ sourceId: z.number().int().positive(), targetId: z.number().int().positive() })
      .parse(input);

    const r = await kanonlarniBirlashtir(sourceId, targetId, Number(user.id) || undefined);
    revalidateTag(TAG_COMMUNITY, "max");
    return { ok: true, natija: `${r.movedAliases} alias, ${r.movedRequests} so'rov ko'chirildi` };
  } catch (err) {
    return actionError(err, "community/birlashtir");
  }
}

/** Ehtimoliy dublikat kanonlar (real vaqtda hisoblanadi). */
export async function dublikatlarAction() {
  await requireAdmin();
  return ehtimoliyDublikatlar();
}

/** Kunni AI bilan (qayta) tahlil qilish. Cheklangan: qimmat amal. */
export async function tahlilIshgaTushir(input: {
  dayKey: string;
  force: boolean;
}): Promise<ActionResult & { natija?: string }> {
  try {
    const user = await requireAdmin();
    const { dayKey, force } = z
      .object({ dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), force: z.boolean() })
      .parse(input);

    // Hisobni bir tunda bo'shatib yubormaslik uchun — daqiqasiga 3 marta
    if (!rateLimit(`community-ai:${user.id}`, 3, 60_000)) {
      return { ok: false, error: "Juda tez-tez. Bir daqiqadan keyin urinib ko'ring." };
    }

    const chatId = await tahlilChatId();
    if (chatId == null) return { ok: false, error: "Guruh topilmadi." };

    const r = await analizQil({ chatId, dayKey, force });
    const m = await moslashtir({ dayKey });

    revalidateTag(TAG_COMMUNITY, "max");
    return {
      ok: true,
      natija:
        `${r.windows} oyna (${r.skipped} o'tkazildi) → ${r.requests} so'rov` +
        (r.errors ? `, ${r.errors} xato` : "") +
        ` | kanon: ${m.kanon} (yangi ${m.yangiKanon}), kategoriya: ${m.categorized}`,
    };
  } catch (err) {
    return actionError(err, "community/tahlilIshgaTushir");
  }
}
