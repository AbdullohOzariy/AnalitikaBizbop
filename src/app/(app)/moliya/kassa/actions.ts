"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, BusinessError, type ActionResult } from "@/lib/action-error";
import { canEnterCash } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam, TASHKENT_OFFSET_MS } from "@/lib/date";

const PATH = "/moliya/kassa";

/** Yirik to'lov chegarasi — undan katta summada kontragent MAJBURIY.
 *  Manbadagi muammo: to'lovlarning 72% ida kontragent bo'sh edi. */
const DEFAULT_LARGE_PAYMENT = 5_000_000;

async function largePaymentThreshold(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: "moliya_large_payment_uzs" } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LARGE_PAYMENT;
}

/** Kassa yozuvini kiritish huquqi — SYSTEM_ADMIN va FINANCE.
 *  Read-only ADMIN/CEO bu yerdan O'TMAYDI. */
async function requireCashEntry() {
  const session = await auth();
  if (!session?.user || !canEnterCash(session.user.roles)) {
    throw new AuthorizationError();
  }
  const id = Number(session.user.id);
  const user = Number.isInteger(id) ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user) throw new AuthorizationError("Sessiyangiz eskirgan. Tizimdan chiqib, qaytadan kiring.");
  return user;
}

/** Foydalanuvchi shu hisobga yozuv kirita oladimi.
 *  UserCashAccount bo'sh bo'lsa — cheklov yo'q (UserBranch naqshi). */
async function assertAccountAllowed(userId: number, ...accountIds: number[]) {
  const scope = await prisma.userCashAccount.findMany({
    where: { userId },
    select: { accountId: true },
  });
  if (scope.length === 0) return;
  const allowed = new Set(scope.map((s) => s.accountId));
  for (const id of accountIds) {
    if (!allowed.has(id)) throw new AuthorizationError("Bu hisobga yozuv kiritish huquqingiz yo'q.");
  }
}

/**
 * Kun yopilgan bo'lsa — o'sha hisobga yozuv kiritib/o'chirib BO'LMAYDI.
 * Aks holda kechagi fizik sanash bugun "noto'g'ri" bo'lib qolardi va farq
 * qayerdan chiqqani yo'qolardi. Tuzatish faqat keyingi kunda storno bilan.
 */
async function assertKunOchiq(accountId: number, businessDate: Date, accountName?: string) {
  const close = await prisma.cashDayClose.findUnique({
    where: { accountId_onDate: { accountId, onDate: businessDate } },
    select: { closedAt: true },
  });
  if (close) {
    const kun = businessDate.toISOString().slice(0, 10);
    throw new BusinessError(
      `${kun} kuni${accountName ? ` «${accountName}» bo'yicha` : ""} allaqachon yopilgan — bu sanaga yozuv kiritib bo'lmaydi.`
    );
  }
}

/** Sana + vaqt. Bugungi kun bo'lsa hozirgi vaqt, o'tgan kun bo'lsa kun o'rtasi.
 *  occurredAt kun ichidagi TARTIBNI saqlaydi — manbadagi "qoldiq manfiyga tushadi"
 *  muammosi aynan tartib yo'qolganidan kelib chiqqan. */
function resolveMoment(businessDate: Date): Date {
  const now = nowTashkent();
  if (isoDay(now) === isoDay(businessDate)) return new Date();
  return new Date(businessDate.getTime() + 12 * 3_600_000 - TASHKENT_OFFSET_MS);
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri.");
const amountSchema = z.coerce
  .number()
  .positive("Summa noldan katta bo'lsin.")
  .max(1e15, "Summa juda katta.");

// ─── Kirim / chiqim ───────────────────────────────────────────────────────────

const txnSchema = z.object({
  businessDate: dateSchema,
  accountId: z.coerce.number().int().positive(),
  articleId: z.coerce.number().int().positive(),
  direction: z.enum(["IN", "OUT"]),
  amount: amountSchema,
  counterpartyId: z.coerce.number().int().positive().nullable().optional(),
  costCenterId: z.coerce.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function yozuvQoshAction(input: {
  businessDate: string;
  accountId: number;
  articleId: number;
  direction: "IN" | "OUT";
  amount: number;
  counterpartyId?: number | null;
  costCenterId?: number | null;
  note?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireCashEntry();
    const d = txnSchema.parse(input);
    await assertAccountAllowed(user.id, d.accountId);

    const businessDate = parseDateParam(d.businessDate);
    if (!businessDate) return { ok: false, error: "Sana noto'g'ri." };

    const article = await prisma.cashFlowArticle.findUnique({
      where: { id: d.articleId },
      select: { isActive: true, isTransfer: true, direction: true, name: true },
    });
    if (!article) return { ok: false, error: "Modda topilmadi." };
    if (!article.isActive) return { ok: false, error: "Bu modda nofaol — tanlash mumkin emas." };

    // Transfer moddasi oddiy yozuv sifatida kiritilmaydi: aks holda bir tomonlama
    // yozuv paydo bo'ladi va kassa qoldig'i buziladi (manbadagi asosiy muammo).
    if (article.isTransfer) {
      return {
        ok: false,
        error: `«${article.name}» — ko'chirish moddasi. «Ko'chirish» formasidan foydalaning (qarshi hisob majburiy).`,
      };
    }

    // Modda yo'nalishi bilan moslik: kirim moddasini chiqimga yozib bo'lmaydi.
    if (article.direction === "IN_ONLY" && d.direction !== "IN")
      return { ok: false, error: `«${article.name}» faqat KIRIM moddasi.` };
    if (article.direction === "OUT_ONLY" && d.direction !== "OUT")
      return { ok: false, error: `«${article.name}» faqat CHIQIM moddasi.` };

    await assertKunOchiq(d.accountId, businessDate);

    // Yirik summada kontragent majburiy.
    const threshold = await largePaymentThreshold();
    if (d.amount >= threshold && !d.counterpartyId) {
      return {
        ok: false,
        error: `${threshold.toLocaleString("uz-UZ")} so'mdan katta summada kontragent ko'rsatilishi shart.`,
      };
    }

    await prisma.cashTxn.create({
      data: {
        occurredAt: resolveMoment(businessDate),
        businessDate,
        accountId: d.accountId,
        articleId: d.articleId,
        direction: d.direction,
        amount: d.amount,
        counterpartyId: d.counterpartyId ?? null,
        costCenterId: d.costCenterId ?? null,
        note: d.note || null,
        source: "MANUAL",
        createdById: user.id,
      },
    });

    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:yozuv");
  }
}

// ─── Ko'chirish (Инкасса / Переброс / Обмен) ──────────────────────────────────

const transferSchema = z.object({
  businessDate: dateSchema,
  fromAccountId: z.coerce.number().int().positive(),
  toAccountId: z.coerce.number().int().positive(),
  articleId: z.coerce.number().int().positive(),
  amount: amountSchema,
  note: z.string().trim().max(500).optional(),
});

export async function kochirishQoshAction(input: {
  businessDate: string;
  fromAccountId: number;
  toAccountId: number;
  articleId: number;
  amount: number;
  note?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireCashEntry();
    const d = transferSchema.parse(input);

    if (d.fromAccountId === d.toAccountId)
      return { ok: false, error: "Qaysi hisobdan va qaysi hisobga — bir xil bo'lmasin." };

    await assertAccountAllowed(user.id, d.fromAccountId);

    const businessDate = parseDateParam(d.businessDate);
    if (!businessDate) return { ok: false, error: "Sana noto'g'ri." };

    const article = await prisma.cashFlowArticle.findUnique({
      where: { id: d.articleId },
      select: { isActive: true, isTransfer: true, name: true },
    });
    if (!article) return { ok: false, error: "Modda topilmadi." };
    if (!article.isActive) return { ok: false, error: "Bu modda nofaol." };
    if (!article.isTransfer)
      return { ok: false, error: `«${article.name}» ko'chirish moddasi emas.` };

    // Ikkala tomon ham ochiq bo'lishi shart — biri yopiq bo'lsa transfer nomutanosib qolardi.
    await assertKunOchiq(d.fromAccountId, businessDate);
    await assertKunOchiq(d.toAccountId, businessDate);

    const occurredAt = resolveMoment(businessDate);

    // Ikki yozuv bitta tranzaksiyada — yetim (juftlanmagan) yozuv bo'lishi mumkin emas.
    await prisma.$transaction(async (tx) => {
      const transfer = await tx.cashTransfer.create({
        data: {
          fromAccountId: d.fromAccountId,
          toAccountId: d.toAccountId,
          amount: d.amount,
          occurredAt,
          businessDate,
          note: d.note || null,
          createdById: user.id,
        },
      });
      await tx.cashTxn.createMany({
        data: [
          {
            occurredAt,
            businessDate,
            accountId: d.fromAccountId,
            articleId: d.articleId,
            direction: "OUT",
            amount: d.amount,
            note: d.note || null,
            transferId: transfer.id,
            source: "MANUAL",
            createdById: user.id,
          },
          {
            occurredAt,
            businessDate,
            accountId: d.toAccountId,
            articleId: d.articleId,
            direction: "IN",
            amount: d.amount,
            note: d.note || null,
            transferId: transfer.id,
            source: "MANUAL",
            createdById: user.id,
          },
        ],
      });
    });

    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:kochirish");
  }
}

// ─── O'chirish ────────────────────────────────────────────────────────────────

export async function yozuvOchirAction(id: number): Promise<ActionResult> {
  try {
    const user = await requireCashEntry();
    const txnId = z.coerce.number().int().positive().parse(id);

    const txn = await prisma.cashTxn.findUnique({
      where: { id: txnId },
      select: { isLocked: true, source: true, transferId: true, accountId: true, businessDate: true },
    });
    if (!txn) return { ok: false, error: "Yozuv topilmadi." };
    if (txn.isLocked || txn.source === "IMPORT")
      return { ok: false, error: "Ko'chirilgan tarix qulflangan — o'chirib bo'lmaydi." };

    await assertAccountAllowed(user.id, txn.accountId);
    await assertKunOchiq(txn.accountId, txn.businessDate);

    // Transferning bir tomonini o'chirish qoldiqni buzadi — butun juftlik o'chadi
    // (CashTxn.transferId onDelete: Cascade).
    if (txn.transferId) {
      await prisma.cashTransfer.delete({ where: { id: txn.transferId } });
    } else {
      await prisma.cashTxn.delete({ where: { id: txnId } });
    }

    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:ochir");
  }
}

// ─── Kontragent (tez qo'shish) ────────────────────────────────────────────────

const counterpartySchema = z.object({
  name: z.string().trim().min(2, "Nom juda qisqa.").max(200, "Nom juda uzun."),
  kind: z.enum(["EMPLOYEE", "SUPPLIER", "ACCOUNTABLE", "OTHER"]),
});

export async function kontragentQoshAction(input: {
  name: string;
  kind: "EMPLOYEE" | "SUPPLIER" | "ACCOUNTABLE" | "OTHER";
}): Promise<ActionResult & { id?: number }> {
  try {
    await requireCashEntry();
    const d = counterpartySchema.parse(input);
    const row = await prisma.counterparty.create({ data: { name: d.name, kind: d.kind } });
    revalidatePath(PATH);
    return { ok: true, id: row.id };
  } catch (err) {
    return actionError(err, "moliya:kontragent");
  }
}
