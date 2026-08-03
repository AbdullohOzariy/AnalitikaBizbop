"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, BusinessError, type ActionResult } from "@/lib/action-error";
import { canEnterCash } from "@/lib/roles";
import { normalizeName } from "@/lib/parsers/utils";
import {
  parseCashbook,
  isOstatka,
  directionsOf,
  type CashbookRow,
} from "@/lib/parsers/cashbook";

const PATH = "/moliya/import";

/** Checksum farqi shu qiymatdan oshsa — partiya RAD ETILADI (yaxlitlash uchun 1 so'm). */
const CHECKSUM_TOLERANCE = 1;

async function requireCash() {
  const session = await auth();
  if (!session?.user || !canEnterCash(session.user.roles)) throw new AuthorizationError();
  const id = Number(session.user.id);
  const user = Number.isInteger(id) ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user) throw new AuthorizationError("Sessiyangiz eskirgan. Tizimdan chiqib, qaytadan kiring.");
  return user;
}

/** Nomlarni bir ko'rinishga keltirish — alias qidiruvi shu kalit bo'yicha. */
const kalit = (s: string) => normalizeName(s).toLowerCase();

/**
 * Qatorning barqaror hashi — takroriy yuklash DUBL YARATMAYDI.
 * Qator raqami ham kiradi: manbada bir kunda bir xil summa/modda bilan
 * ikkita HAQIQIY yozuv bo'lishi mumkin (masalan ikki smena tushumi).
 */
function rowHash(r: CashbookRow, dir: string): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        r.rawDate,
        r.rawDesk,
        r.rawArticle,
        r.rawPerson,
        r.rawNote,
        r.amountIn ?? "",
        r.amountOut ?? "",
        r.rowNo,
        dir,
      ].join("|")
    )
    .digest("hex");
}

export type ImportNatija = {
  batchId: number;
  rowsTotal: number;
  imported: number;
  duplicates: number;
  openings: number;
  unmatched: number;
  skipped: number;
  balanceBreaks: number;
  sourceSumIn: number | null;
  sourceSumOut: number | null;
  parsedSumIn: number;
  parsedSumOut: number;
};

export async function tarixImportAction(
  formData: FormData
): Promise<(ActionResult & { natija?: ImportNatija })> {
  try {
    const user = await requireCash();
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "Fayl tanlanmagan." };
    if (file.size > 30 * 1024 * 1024) return { ok: false, error: "Fayl juda katta (30 MB gacha)." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseCashbook(buffer);

    // ── CHECKSUM: manba jami bilan bizniki mos kelmasa — HECH NARSA yozilmaydi ──
    const inFarq =
      parsed.sourceSumIn != null ? Math.abs(parsed.sourceSumIn - parsed.parsedSumIn) : 0;
    const outFarq =
      parsed.sourceSumOut != null ? Math.abs(parsed.sourceSumOut - parsed.parsedSumOut) : 0;

    if (inFarq > CHECKSUM_TOLERANCE || outFarq > CHECKSUM_TOLERANCE) {
      await prisma.cashImportBatch.create({
        data: {
          fileName: file.name,
          fileHash: parsed.fileHash,
          status: "FAILED",
          sourceSumIn: parsed.sourceSumIn,
          sourceSumOut: parsed.sourceSumOut,
          parsedSumIn: parsed.parsedSumIn,
          parsedSumOut: parsed.parsedSumOut,
          rowsTotal: parsed.rows.length,
          error: `Checksum mos kelmadi: kirim farqi ${inFarq}, chiqim farqi ${outFarq}`,
          createdById: user.id,
        },
      });
      revalidatePath(PATH);
      throw new BusinessError(
        `Checksum mos kelmadi — hech narsa import qilinmadi. ` +
          `Manba: kirim ${parsed.sourceSumIn?.toLocaleString("uz-UZ")} / chiqim ${parsed.sourceSumOut?.toLocaleString("uz-UZ")}; ` +
          `o'qilgan: ${parsed.parsedSumIn.toLocaleString("uz-UZ")} / ${parsed.parsedSumOut.toLocaleString("uz-UZ")}. ` +
          `Faylda yashirilgan qator yoki filtr bo'lishi mumkin.`
      );
    }

    // ── Ma'lumotnomalarni yuklab, moslashtirish jadvallarini quramiz ──
    const [accounts, accAliases, articles, artAliases] = await Promise.all([
      prisma.cashAccount.findMany({ select: { id: true, name: true } }),
      prisma.cashAccountAlias.findMany({ select: { accountId: true, alias: true } }),
      prisma.cashFlowArticle.findMany({ select: { id: true, name: true } }),
      prisma.cashFlowArticleAlias.findMany({ select: { articleId: true, alias: true } }),
    ]);

    const deskMap = new Map<string, number>();
    for (const a of accounts) deskMap.set(kalit(a.name), a.id);
    for (const a of accAliases) deskMap.set(kalit(a.alias), a.accountId);

    const artMap = new Map<string, number>();
    for (const a of articles) artMap.set(kalit(a.name), a.id);
    for (const a of artAliases) artMap.set(kalit(a.alias), a.articleId);

    const batch = await prisma.cashImportBatch.create({
      data: {
        fileName: file.name,
        fileHash: parsed.fileHash,
        sourceSumIn: parsed.sourceSumIn,
        sourceSumOut: parsed.sourceSumOut,
        parsedSumIn: parsed.parsedSumIn,
        parsedSumOut: parsed.parsedSumOut,
        rowsTotal: parsed.rows.length,
        createdById: user.id,
      },
    });

    type TxnData = {
      occurredAt: Date;
      businessDate: Date;
      accountId: number;
      articleId: number;
      direction: "IN" | "OUT";
      amount: number;
      note: string | null;
      source: "IMPORT";
      isLocked: true;
      sourceRowHash: string;
      importBatchId: number;
      createdById: number;
    };

    const txns: TxnData[] = [];
    const openings: { accountId: number; onDate: Date; amount: number; note: string | null }[] = [];
    const unmatched: {
      batchId: number;
      reason: string;
      rowNo: number;
      rawDesk: string | null;
      rawArticle: string | null;
      rawDate: string | null;
      rawPerson: string | null;
      rawNote: string | null;
      amountIn: number | null;
      amountOut: number | null;
      accountId: number | null;
    }[] = [];
    let skipped = 0;

    for (const r of parsed.rows) {
      const dirs = directionsOf(r);
      if (dirs.length === 0) {
        skipped++;
        continue;
      }

      const accountId = deskMap.get(kalit(r.rawDesk)) ?? null;
      const articleId = artMap.get(kalit(r.rawArticle)) ?? null;

      const sabab = !r.date
        ? "date"
        : accountId == null
        ? "desk"
        : articleId == null
        ? "article"
        : dirs.length === 2
        ? "both_directions"
        : null;

      const xom = {
        batchId: batch.id,
        rowNo: r.rowNo,
        rawDesk: r.rawDesk || null,
        rawArticle: r.rawArticle || null,
        rawDate: r.rawDate || null,
        rawPerson: r.rawPerson || null,
        rawNote: r.rawNote || null,
        amountIn: r.amountIn,
        amountOut: r.amountOut,
        accountId,
      };

      // Tanilmagan qator YO'QOTILMAYDI — ro'yxatga tushadi.
      if (sabab && sabab !== "both_directions") {
        unmatched.push({ ...xom, reason: sabab });
        continue;
      }

      // "Остатка" — CashTxn EMAS, davr boshi qoldig'i (aylanma shishmasin)
      if (isOstatka(r.rawArticle)) {
        openings.push({
          accountId: accountId!,
          onDate: r.date!,
          amount: (r.amountIn ?? 0) - (r.amountOut ?? 0),
          note: `import: ${file.name}`,
        });
        continue;
      }

      // Bir qatorda ikki yo'nalish — ikkala yozuv ham saqlanadi VA ko'rikka tushadi
      if (dirs.length === 2) unmatched.push({ ...xom, reason: "both_directions" });

      for (const dir of dirs) {
        txns.push({
          occurredAt: new Date(r.date!.getTime() + 12 * 3_600_000),
          businessDate: r.date!,
          accountId: accountId!,
          articleId: articleId!,
          direction: dir,
          amount: dir === "IN" ? r.amountIn! : r.amountOut!,
          note: [r.rawPerson, r.rawNote].filter(Boolean).join(" · ") || null,
          source: "IMPORT",
          isLocked: true, // ko'chirilgan tarix tahrirlanmaydi
          sourceRowHash: rowHash(r, dir),
          importBatchId: batch.id,
          createdById: user.id,
        });
      }
    }

    // ── Yozish ──
    const created = await prisma.cashTxn.createMany({
      data: txns,
      skipDuplicates: true, // sourceRowHash @unique — qayta yuklash xavfsiz
    });

    let openingCount = 0;
    for (const o of openings) {
      await prisma.cashAccountOpening.upsert({
        where: { accountId_onDate: { accountId: o.accountId, onDate: o.onDate } },
        create: o,
        update: { amount: o.amount, note: o.note },
      });
      openingCount++;
    }

    if (unmatched.length > 0) {
      await prisma.unmatchedCashRow.createMany({ data: unmatched });
    }

    await prisma.cashImportBatch.update({
      where: { id: batch.id },
      data: {
        rowsImported: created.count,
        rowsSkipped: skipped,
        rowsUnmatched: unmatched.length,
      },
    });

    revalidatePath(PATH);
    revalidatePath("/moliya/kassa");
    revalidatePath("/moliya/qoldiq");

    return {
      ok: true,
      natija: {
        batchId: batch.id,
        rowsTotal: parsed.rows.length,
        imported: created.count,
        duplicates: txns.length - created.count,
        openings: openingCount,
        unmatched: unmatched.length,
        skipped,
        balanceBreaks: parsed.balanceBreaks.length,
        sourceSumIn: parsed.sourceSumIn,
        sourceSumOut: parsed.sourceSumOut,
        parsedSumIn: parsed.parsedSumIn,
        parsedSumOut: parsed.parsedSumOut,
      },
    };
  } catch (err) {
    if (err instanceof Error && !(err instanceof BusinessError) && err.message.includes("topilmadi")) {
      // Parser xatosi — matni ataylab tushunarli yozilgan
      return { ok: false, error: err.message };
    }
    return actionError(err, "moliya:import");
  }
}

/** Partiyani bekor qilish — o'sha yuklashda kelgan hamma narsa o'chadi. */
export async function partiyaBekorAction(
  batchId: number
): Promise<ActionResult & { ochirilgan?: number }> {
  try {
    await requireCash();
    const batch = await prisma.cashImportBatch.findUnique({
      where: { id: batchId },
      select: { id: true, fileName: true },
    });
    if (!batch) return { ok: false, error: "Partiya topilmadi." };

    // Shu partiyada kelgan yozuvlar YOPILGAN kunga tegib qolgan bo'lsa —
    // bekor qilish qoldiqni buzardi. Avval tekshiramiz.
    const yopiq = await prisma.cashTxn.count({
      where: {
        importBatchId: batch.id,
        account: { closes: { some: {} } },
      },
    });
    if (yopiq > 0) {
      const toqnash = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
        FROM "CashTxn" t
        JOIN "CashDayClose" c
          ON c."accountId" = t."accountId" AND c."onDate" = t."businessDate"
        WHERE t."importBatchId" = ${batch.id}
      `;
      if (Number(toqnash[0]?.n ?? 0) > 0) {
        throw new BusinessError(
          "Bu partiyadagi ba'zi yozuvlar YOPILGAN kunlarga tegishli. Avval o'sha kunlarni oching."
        );
      }
    }

    const ochirilgan = await prisma.cashTxn.deleteMany({ where: { importBatchId: batch.id } });
    // Moslanmagan qatorlar kaskad bilan o'chadi (UnmatchedCashRow.batchId onDelete: Cascade)
    await prisma.cashImportBatch.delete({ where: { id: batch.id } });

    revalidatePath(PATH);
    revalidatePath("/moliya/kassa");
    revalidatePath("/moliya/qoldiq");
    return { ok: true, ochirilgan: ochirilgan.count };
  } catch (err) {
    return actionError(err, "moliya:partiya-bekor");
  }
}
