"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { TAG_COMMUNITY } from "@/lib/cache-tags";
import { normKalit } from "@/lib/community/match";
import { analizQil } from "@/lib/community/analiz";
import { moslashtir } from "@/lib/community/match";
import { tahlilChatId } from "@/lib/community/sozlama";
import { rateLimit } from "@/lib/spisaniya/rate-limit";

/**
 * Tahrirlash — HOZIRCHA FAQAT SYSTEM_ADMIN (`requireAdmin`).
 * AI xato qilishi tabiiy, shuning uchun har bir tuzatish `TgProductAlias` ga MANUAL
 * bo'lib yoziladi: o'sha nom keyingi safar LLM'ga umuman bormaydi va qayta tahlilda
 * ham qo'lda kiritilgan qaror saqlanadi.
 */

const StatusSchema = z.enum(["YES", "NO", "UNANSWERED", "UNCLEAR"]);

/** So'rovning SKU/kategoriya mosligini qo'lda tuzatish. */
export async function tuzatMoslik(input: {
  requestId: number;
  productId: number | null;
  categoryId: number | null;
  hammasigaQoll: boolean;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const { requestId, productId, categoryId, hammasigaQoll } = z
      .object({
        requestId: z.number().int().positive(),
        productId: z.number().int().positive().nullable(),
        categoryId: z.number().int().positive().nullable(),
        hammasigaQoll: z.boolean(),
      })
      .parse(input);

    const req = await prisma.tgRequest.findUnique({
      where: { id: requestId },
      select: { productNorm: true },
    });
    if (!req) return { ok: false, error: "So'rov topilmadi." };

    // SKU tanlansa, kategoriya SKU'nikidan olinadi (qo'lda berilmagan bo'lsa)
    let catId = categoryId;
    if (productId && catId == null) {
      const p = await prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true },
      });
      catId = p?.categoryId ?? null;
    }

    await prisma.tgRequest.update({
      where: { id: requestId },
      data: { productId, categoryId: catId, matchStatus: "MANUAL", matchScore: 1 },
    });

    // Bir xil nomli barcha so'rovlarga qo'llash + keyingi safar uchun keshga yozish
    if (req.productNorm) {
      const norm = normKalit(req.productNorm);
      await prisma.tgProductAlias.upsert({
        where: { norm },
        create: { norm, productId, categoryId: catId, source: "MANUAL", score: 1, hits: 1 },
        update: { productId, categoryId: catId, source: "MANUAL", score: 1 },
      });
      if (hammasigaQoll) {
        await prisma.tgRequest.updateMany({
          where: { productNorm: req.productNorm, id: { not: requestId } },
          data: { productId, categoryId: catId, matchStatus: "MANUAL", matchScore: 1 },
        });
      }
    }

    revalidateTag(TAG_COMMUNITY, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "community/tuzatMoslik");
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
      // Qo'lda tasdiqlangan holat — ishonch to'liq
      data: { status, confidence: 1 },
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

export type SkuOpt = { id: number; name: string; categoryId: number | null; categoryName: string | null };

/** SKU qidirish (tuzatish oynasidagi picker uchun). */
export async function skuQidir(q: string): Promise<SkuOpt[]> {
  await requireAdmin();
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await prisma.product.findMany({
    where: { archivedAt: null, name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true, categoryId: true, category: { select: { name: true } } },
    take: 25,
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
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
        ` | SKU: ${m.matched}, kategoriya: ${m.categorized}`,
    };
  } catch (err) {
    return actionError(err, "community/tahlilIshgaTushir");
  }
}
