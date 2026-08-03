"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, BusinessError, type ActionResult } from "@/lib/action-error";
import { canEnterCash } from "@/lib/roles";
import { parseCashDate } from "@/lib/parsers/cashbook";

const PATH = "/moliya/moslanmagan";

async function requireCash() {
  const session = await auth();
  if (!session?.user || !canEnterCash(session.user.roles)) throw new AuthorizationError();
  const id = Number(session.user.id);
  const user = Number.isInteger(id) ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user) throw new AuthorizationError("Sessiyangiz eskirgan. Tizimdan chiqib, qaytadan kiring.");
  return user;
}

const halSchema = z.object({
  id: z.coerce.number().int().positive(),
  accountId: z.coerce.number().int().positive(),
  articleId: z.coerce.number().int().positive(),
  /** true — tanlangan biriktirish ALIAS bo'lib saqlanadi (keyingi importda avtomatik). */
  saveAlias: z.boolean().optional(),
});

/**
 * Moslanmagan qatorni hal qilish: kassa va modda biriktiriladi, yozuv yaratiladi.
 *
 * Biriktirish ALIAS sifatida saqlanadi — bu importning eng qimmatli tomoni:
 * har hal qilingan nom keyingi safar avtomatik tanilib, qo'l mehnati kamayadi.
 */
export async function qatorHalAction(input: {
  id: number;
  accountId: number;
  articleId: number;
  saveAlias?: boolean;
}): Promise<ActionResult> {
  try {
    const user = await requireCash();
    const d = halSchema.parse(input);

    const row = await prisma.unmatchedCashRow.findUnique({
      where: { id: d.id },
      select: {
        id: true,
        reason: true,
        rowNo: true,
        rawDate: true,
        rawDesk: true,
        rawArticle: true,
        rawPerson: true,
        rawNote: true,
        amountIn: true,
        amountOut: true,
        resolvedAt: true,
        batchId: true,
      },
    });
    if (!row) return { ok: false, error: "Qator topilmadi." };
    if (row.resolvedAt) throw new BusinessError("Bu qator allaqachon hal qilingan.");

    const date = parseCashDate(row.rawDate);
    if (!date) throw new BusinessError("Sana o'qilmadi — qatorni qo'lda kiritishga to'g'ri keladi.");

    const kirim = row.amountIn ? Number(row.amountIn) : 0;
    const chiqim = row.amountOut ? Number(row.amountOut) : 0;
    if (kirim <= 0 && chiqim <= 0) throw new BusinessError("Qatorda summa yo'q.");

    // "both_directions" qatori import paytida ALLAQACHON ikki yozuv yaratgan —
    // uni faqat KO'RIB CHIQILGAN deb belgilaymiz, qayta yozuv yaratmaymiz.
    if (row.reason === "both_directions") {
      await prisma.unmatchedCashRow.update({
        where: { id: row.id },
        data: { resolvedAt: new Date(), accountId: d.accountId },
      });
      revalidatePath(PATH);
      return { ok: true };
    }

    const dir: "IN" | "OUT" = kirim > 0 ? "IN" : "OUT";
    const amount = kirim > 0 ? kirim : chiqim;

    const hash = crypto
      .createHash("sha256")
      .update(
        [row.rawDate, row.rawDesk, row.rawArticle, row.rawPerson, row.rawNote, kirim, chiqim, row.rowNo, dir].join("|")
      )
      .digest("hex");

    await prisma.$transaction(async (tx) => {
      const txn = await tx.cashTxn.create({
        data: {
          occurredAt: new Date(date.getTime() + 12 * 3_600_000),
          businessDate: date,
          accountId: d.accountId,
          articleId: d.articleId,
          direction: dir,
          amount,
          note: [row.rawPerson, row.rawNote].filter(Boolean).join(" · ") || null,
          source: "IMPORT",
          isLocked: true,
          sourceRowHash: hash,
          importBatchId: row.batchId,
          createdById: user.id,
        },
      });

      if (d.saveAlias) {
        // Kassa aliasi — faqat kassa tanilmagan bo'lsa mantiqiy
        if (row.reason === "desk" && row.rawDesk) {
          await tx.cashAccountAlias
            .create({ data: { alias: row.rawDesk, accountId: d.accountId } })
            .catch(() => undefined); // alias band bo'lsa — jim o'tamiz
        }
        if (row.reason === "article" && row.rawArticle) {
          await tx.cashFlowArticleAlias
            .create({ data: { alias: row.rawArticle, articleId: d.articleId } })
            .catch(() => undefined);
        }
      }

      await tx.unmatchedCashRow.update({
        where: { id: row.id },
        data: { resolvedAt: new Date(), resolvedTxnId: txn.id, accountId: d.accountId },
      });
    });

    revalidatePath(PATH);
    revalidatePath("/moliya/kassa");
    revalidatePath("/moliya/qoldiq");
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:qator-hal");
  }
}

/** Qatorni ataylab e'tiborsiz qoldirish (masalan bo'sh/xizmat qatori). */
export async function qatorEtiborsizAction(id: number): Promise<ActionResult> {
  try {
    await requireCash();
    await prisma.unmatchedCashRow.update({
      where: { id: z.coerce.number().int().positive().parse(id) },
      data: { resolvedAt: new Date() },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:qator-etiborsiz");
  }
}
