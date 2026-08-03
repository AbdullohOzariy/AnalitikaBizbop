/**
 * Kassa yozuvini yaratish — BIZNES QOIDALARI shu yerda, BIR MARTA.
 *
 * NEGA ALOHIDA MODUL: yozuv ikki yo'ldan kiritiladi — web (server action) va
 * Telegram miniapp (API route). Qoidalar ikki joyda takrorlansa, ular vaqt
 * o'tib bir-biridan uzoqlashadi va telefondan kiritilgan yozuv tekshiruvsiz
 * o'tib ketadi. Shuning uchun ikkala yo'l ham AYNAN shu funksiyani chaqiradi.
 *
 * Qoidalar manba tahlilidagi real nuqsonlardan kelib chiqqan (MOLIYA_PLAN.md).
 */
import { prisma } from "@/lib/prisma";
import { isoDay, nowTashkent, TASHKENT_OFFSET_MS } from "@/lib/date";

/** Yirik to'lov chegarasi — undan katta summada kontragent MAJBURIY. */
const DEFAULT_LARGE_PAYMENT = 5_000_000;

export type YozuvKirish = {
  businessDate: Date;
  accountId: number;
  articleId: number;
  direction: "IN" | "OUT";
  amount: number;
  counterpartyId?: number | null;
  costCenterId?: number | null;
  note?: string | null;
  source: "MANUAL" | "MINIAPP";
  createdById: number;
};

export type YozuvNatija = { ok: true; id: number } | { ok: false; error: string };

export async function largePaymentThreshold(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: "moliya_large_payment_uzs" } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LARGE_PAYMENT;
}

/**
 * Foydalanuvchi shu hisob(lar)ga yozuv kirita oladimi.
 * `UserCashAccount` bo'sh bo'lsa cheklov yo'q (UserBranch naqshi).
 */
export async function hisobRuxsati(userId: number, ...accountIds: number[]): Promise<boolean> {
  const scope = await prisma.userCashAccount.findMany({
    where: { userId },
    select: { accountId: true },
  });
  if (scope.length === 0) return true;
  const allowed = new Set(scope.map((s) => s.accountId));
  return accountIds.every((id) => allowed.has(id));
}

/** Kun yopilganmi — yopilgan bo'lsa o'sha hisob+sanaga yozuv kirmaydi. */
export async function kunYopiqmi(accountId: number, businessDate: Date): Promise<boolean> {
  const c = await prisma.cashDayClose.findUnique({
    where: { accountId_onDate: { accountId, onDate: businessDate } },
    select: { id: true },
  });
  return c !== null;
}

/**
 * Sana + vaqt. Bugungi kun bo'lsa hozirgi vaqt, o'tgan kun bo'lsa kun o'rtasi.
 * occurredAt kun ichidagi TARTIBNI saqlaydi — manbadagi "qoldiq manfiyga tushadi"
 * muammosi aynan tartib yo'qolganidan kelib chiqqan.
 */
export function resolveMoment(businessDate: Date): Date {
  const now = nowTashkent();
  if (isoDay(now) === isoDay(businessDate)) return new Date();
  return new Date(businessDate.getTime() + 12 * 3_600_000 - TASHKENT_OFFSET_MS);
}

/**
 * Barcha qoidalarni qo'llab yozuv yaratadi.
 * Xato holatida `{ ok:false, error }` qaytaradi — matn foydalanuvchiga ko'rsatiladi.
 */
export async function kassaYozuvYarat(input: YozuvKirish): Promise<YozuvNatija> {
  if (!(input.amount > 0)) return { ok: false, error: "Summa noldan katta bo'lsin." };

  if (!(await hisobRuxsati(input.createdById, input.accountId))) {
    return { ok: false, error: "Bu hisobga yozuv kiritish huquqingiz yo'q." };
  }

  const article = await prisma.cashFlowArticle.findUnique({
    where: { id: input.articleId },
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
  if (article.direction === "IN_ONLY" && input.direction !== "IN")
    return { ok: false, error: `«${article.name}» faqat KIRIM moddasi.` };
  if (article.direction === "OUT_ONLY" && input.direction !== "OUT")
    return { ok: false, error: `«${article.name}» faqat CHIQIM moddasi.` };

  if (await kunYopiqmi(input.accountId, input.businessDate)) {
    return {
      ok: false,
      error: `${isoDay(input.businessDate)} kuni allaqachon yopilgan — bu sanaga yozuv kiritib bo'lmaydi.`,
    };
  }

  const threshold = await largePaymentThreshold();
  if (input.amount >= threshold && !input.counterpartyId) {
    return {
      ok: false,
      error: `${threshold.toLocaleString("uz-UZ")} so'mdan katta summada kontragent ko'rsatilishi shart.`,
    };
  }

  const txn = await prisma.cashTxn.create({
    data: {
      occurredAt: resolveMoment(input.businessDate),
      businessDate: input.businessDate,
      accountId: input.accountId,
      articleId: input.articleId,
      direction: input.direction,
      amount: input.amount,
      counterpartyId: input.counterpartyId ?? null,
      costCenterId: input.costCenterId ?? null,
      note: input.note || null,
      source: input.source,
      createdById: input.createdById,
    },
    select: { id: true },
  });

  return { ok: true, id: txn.id };
}
