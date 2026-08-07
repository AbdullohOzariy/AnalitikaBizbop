"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  filialQoshish,
  filialYangila,
  filialOchir,
  guruhChatIdSaqla,
  ruxsatQoshish,
  ruxsatToggle,
  ruxsatOchir,
} from "@/lib/spisaniya/db";
import { redactError, redactForLog } from "@/lib/tg-redact";

type Result = { ok: true } | { ok: false; error: string };

function xato(err: unknown): Result {
  const msg = err instanceof Error ? redactError(err) : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  // Postgres unique violation / FK violation — tushunarli xabar
  if (msg.includes("duplicate key") || msg.includes("23505"))
    return { ok: false, error: "Bunday nom allaqachon mavjud." };
  if (msg.includes("foreign key") || msg.includes("23503"))
    return {
      ok: false,
      error:
        "Bu filialda yozuvlar bor — o'chirib bo'lmaydi (o'rniga nofaol qiling).",
    };
  return { ok: false, error: msg };
}

const RP = "/admin/sozlamalar";

// ─── Filialar ─────────────────────────────────────────────────────────────────
const nomiSchema = z.string().trim().min(1, "Nom kerak").max(100);

export async function filialQoshishAction(nomi: string): Promise<Result> {
  try {
    await requireAdmin();
    await filialQoshish(nomiSchema.parse(nomi));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

const filialPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  nomi: z.string().trim().min(1).max(100).optional(),
  aktiv: z.boolean().optional(),
  // topic_id — raqam yoki bo'sh (null = topic yo'q)
  topic_id: z
    .string()
    .trim()
    .regex(/^-?\d*$/, "Faqat raqam")
    .optional(),
});

export async function filialYangilaAction(input: {
  id: number;
  nomi?: string;
  aktiv?: boolean;
  topic_id?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = filialPatchSchema.parse(input);
    await filialYangila(p.id, {
      nomi: p.nomi,
      aktiv: p.aktiv,
      topic_id: p.topic_id === undefined ? undefined : p.topic_id || null,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function filialOchirAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    await filialOchir(z.coerce.number().int().positive().parse(id));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── Analitika filial → bizbop (chiqim) filial nomi bog'lash ───────────────────
// Foyda (Iyerarxiya) hisobotidagi chiqim bizbop "yozuvlar.filial" bo'yicha filtrlanadi.
// Analitika Branch nomi bizbop nomi bilan har doim mos kelmaydi — shu bog'lash orqali ulaymiz.
const chiqimFilialSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  filial: z.string().trim().max(120), // bo'sh — bog'lashni olib tashlash (name'ga qaytadi)
});

export async function chiqimFilialBoglaAction(input: {
  branchId: number;
  filial: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = chiqimFilialSchema.parse(input);
    const { prisma } = await import("@/lib/prisma");
    await prisma.branch.update({
      where: { id: p.branchId },
      data: { chiqimFilial: p.filial || null },
    });
    // Foyda hisoboti keshi chiqim filtri o'zgargani uchun yangilanishi shart
    const { ANALYTICS_CACHE_TAG } = await import("@/lib/analytics");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── Guruh chat_id ──────────────────────────────────────────────────────────────
const chatIdSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/, "Chat ID raqam bo'lishi kerak");

export async function guruhSaqlaAction(chatId: string): Promise<Result> {
  try {
    await requireAdmin();
    await guruhChatIdSaqla(chatIdSchema.parse(chatId));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── Bot foydalanuvchilari (whitelist) ────────────────────────────────────────
const tgIdSchema = z
  .string()
  .trim()
  .regex(/^\d{5,15}$/, "Telegram ID — 5-15 raqam");

export async function ruxsatQoshishAction(input: {
  telegramId: string;
  ism?: string;
}): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const telegramId = tgIdSchema.parse(input.telegramId);
    const ism = (input.ism ?? "").trim().slice(0, 100) || null;
    await ruxsatQoshish(
      telegramId,
      ism,
      admin.name?.trim() || admin.email || "admin",
    );
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function ruxsatToggleAction(
  telegramId: string,
  aktiv: boolean,
): Promise<Result> {
  try {
    await requireAdmin();
    await ruxsatToggle(tgIdSchema.parse(telegramId), aktiv);
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function ruxsatOchirAction(telegramId: string): Promise<Result> {
  try {
    await requireAdmin();
    await ruxsatOchir(tgIdSchema.parse(telegramId));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── Bot xodimiga Iyerarxiya kategoriyalarini biriktirish (BotUserCategory) ────
// OTA kategoriya id'si → barcha bolalari; SUB id → faqat o'zi. Bo'sh ro'yxat =
// cheklovsiz (to'liq katalog). To'plam har safar to'liq almashtiriladi.
const katIdsSchema = z.array(z.number().int().positive()).max(200);

export async function botUserKategoriyaSaqlaAction(
  telegramId: string,
  categoryIds: number[],
): Promise<Result> {
  try {
    await requireAdmin();
    const tgId = BigInt(tgIdSchema.parse(telegramId));
    const ids = [...new Set(katIdsSchema.parse(categoryIds))];
    const { prisma } = await import("@/lib/prisma");
    if (ids.length) {
      const bor = await prisma.category.count({ where: { id: { in: ids } } });
      if (bor !== ids.length)
        return {
          ok: false,
          error: "Kategoriya topilmadi — sahifani yangilang.",
        };
    }
    await prisma.$transaction([
      prisma.botUserCategory.deleteMany({ where: { telegramId: tgId } }),
      ...(ids.length
        ? [
            prisma.botUserCategory.createMany({
              data: ids.map((categoryId) => ({ telegramId: tgId, categoryId })),
            }),
          ]
        : []),
    ]);
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Sverka guruh chat ID'sini saqlash (asosiy baza, AppSetting). */
export async function sverkaGuruhSaqlaAction(chatId: string): Promise<Result> {
  try {
    await requireAdmin();
    const v = chatId.trim();
    if (v && !/^-?\d{5,20}$/.test(v)) {
      return {
        ok: false,
        error: "Chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    const { setSverkaGroupChatId } = await import("@/lib/sverka/sozlama");
    await setSverkaGroupChatId(v);
    revalidatePath("/admin/sozlamalar");
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Sverka: filial → guruh topigi (message_thread_id) bog'lash. */
export async function sverkaTopicSaqlaAction(input: {
  branchId: number;
  topicId: string; // bo'sh — olib tashlash
}): Promise<Result> {
  try {
    await requireAdmin();
    const branchId = z.coerce.number().int().positive().parse(input.branchId);
    const raw = input.topicId.trim();
    if (raw && !/^\d{1,12}$/.test(raw)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    const { prisma } = await import("@/lib/prisma");
    await prisma.branch.update({
      where: { id: branchId },
      data: { sverkaTopicId: raw ? Number(raw) : null },
    });
    const { clearSverkaTopicCache } = await import("@/lib/sverka/sozlama");
    clearSverkaTopicCache();
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Sverka "Qabul qildi" ro'yxati — ism qo'shish. */
export async function sverkaQabulchiQoshAction(ism: string): Promise<Result> {
  try {
    await requireAdmin();
    const nm = z.string().trim().min(1, "Ism kiriting").max(120).parse(ism);
    const { prisma } = await import("@/lib/prisma");
    await prisma.sverkaQabulchi.upsert({
      where: { ism: nm },
      create: { ism: nm },
      update: {},
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function sverkaQabulchiOchirAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const qid = z.coerce.number().int().positive().parse(id);
    const { prisma } = await import("@/lib/prisma");
    await prisma.sverkaQabulchi.delete({ where: { id: qid } });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── Inventarizatsiya xabarnoma bot (kunlik muammoli tovarlar hisoboti) ─────────

/** Bot token + guruh chat id + topic id'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function inventoryReportSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setInventoryReportConfig } =
      await import("@/lib/inventory-report/sozlama");
    await setInventoryReportConfig({ token, chatId, topicId });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Hisobotni hoziroq yuborish (sinov tugmasi). Yuborilgan muammoli SKU sonini qaytaradi. */
export async function inventoryReportYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendInventoryReport } =
      await import("@/lib/inventory-report/report");
    return await sendInventoryReport();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Marja (marjasi minus filial×subkat) xabarnoma bot ─────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function marginReportSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setMarginReportConfig } =
      await import("@/lib/margin-report/sozlama");
    await setMarginReportConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Marja hisobotini hoziroq yuborish (sinov tugmasi). Minus kataklar sonini qaytaradi. */
export async function marginReportYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendMarginReport } = await import("@/lib/margin-report/report");
    return await sendMarginReport();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Zaxira normasi hisoboti ──────────────────────────────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function stockdayReportSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
  excludeCodes: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setStockdayReportConfig } =
      await import("@/lib/stockday-report/sozlama");
    await setStockdayReportConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
      excludeCodes: input.excludeCodes ?? "",
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Zaxira normasi hisobotini hoziroq yuborish (sinov tugmasi). Oshgan qatorlar sonini qaytaradi. */
export async function stockdayReportYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendStockdayNormReport } =
      await import("@/lib/stockday-report/report");
    return await sendStockdayNormReport();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Yetkazib berish kechikishi signali ────────────────────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function deliveryAlertSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setDeliveryAlertConfig } =
      await import("@/lib/delivery-alert/sozlama");
    await setDeliveryAlertConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Kechikish signalini hoziroq yuborish (sinov tugmasi). Kechikkan zakazlar sonini qaytaradi. */
export async function deliveryAlertYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendDeliveryAlert } = await import("@/lib/delivery-alert/report");
    return await sendDeliveryAlert();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Muddat (yaroqlilik) signali ───────────────────────────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish. token bo'sh — o'zgartirilmaydi. */
export async function expiryAlertSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setExpiryAlertConfig } = await import("@/lib/expiry-alert/sozlama");
    await setExpiryAlertConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Muddat signalini hoziroq yuborish (sinov). Shoshilinch partiyalar sonini qaytaradi. */
export async function expiryAlertYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendExpiryAlert } = await import("@/lib/expiry-alert/report");
    return await sendExpiryAlert();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Aksiya (promo) signali ────────────────────────────────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish. token bo'sh — o'zgartirilmaydi. */
export async function promoAlertSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setPromoAlertConfig } = await import("@/lib/promo-alert/sozlama");
    await setPromoAlertConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Aksiya signalini hoziroq yuborish (sinov). Bugungi aksiyalar sonini qaytaradi. */
export async function promoAlertYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendPromoAlert } = await import("@/lib/promo-alert/report");
    return await sendPromoAlert();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Zakaz PDF (ACCEPTED'da nakladnoy Telegram guruhga) ─────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function zakazPdfSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz yuborish o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setZakazPdfConfig } = await import("@/lib/zakaz-pdf/sozlama");
    await setZakazPdfConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Sinov: eng oxirgi qabul qilingan (yoki istalgan oxirgi) zakazni hozir yuboradi. */
export async function zakazPdfTestAction(): Promise<
  { ok: true; orderId: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { prisma } = await import("@/lib/prisma");
    const target =
      (await prisma.purchaseOrder.findFirst({
        where: { status: "ACCEPTED" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })) ??
      (await prisma.purchaseOrder.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      }));
    if (!target) return { ok: false, error: "Sinov uchun zakaz topilmadi." };
    const { sendZakazPdf } = await import("@/lib/zakaz-pdf/send");
    const r = await sendZakazPdf(target.id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, orderId: target.id };
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Spisaniya kunlik indikator hisoboti (eng xavfli subkat + filial) ──────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function spisaniyaDailySaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz yuborish o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setSpisaniyaDailyConfig } =
      await import("@/lib/spisaniya-daily/sozlama");
    await setSpisaniyaDailyConfig({
      token,
      chatId,
      topicId,
      autoEnabled: !!input.autoEnabled,
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Kunlik hisobotni hoziroq yuborish (sinov). Jami chiqim summasini qaytaradi. */
export async function spisaniyaDailyYuborAction(): Promise<
  { ok: true; total: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendSpisaniyaDailyReport } =
      await import("@/lib/spisaniya-daily/report");
    return await sendSpisaniyaDailyReport();
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Filiallar narx farqi hisoboti (kunlik PDF) ────────────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function narxReportSaqlaAction(input: {
  token: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return {
        ok: false,
        error:
          "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi).",
      };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return {
        ok: false,
        error:
          "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida).",
      };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return {
        ok: false,
        error: "Bot token noto'g'ri (123456:ABC... ko'rinishida).",
      };
    }
    const { setNarxReportConfig } = await import("@/lib/narx-report/sozlama");
    // ALOHIDA catch: bu chaqiruv argumentlari orasida TOKEN bor. Prisma xatolari
    // (masalan PrismaClientValidationError) argumentlarni xato matniga qo'shadi, ya'ni
    // xom `err.message` brauzerga tokenni olib chiqishi mumkin edi. Mijozga umumiy
    // xabar, serverga esa redaksiyalangan diagnostika beramiz.
    try {
      await setNarxReportConfig({
        token,
        chatId,
        topicId,
        autoEnabled: !!input.autoEnabled,
      });
    } catch (err) {
      console.error("[sozlamalar] narxReportSaqla:", redactForLog(err));
      return {
        ok: false,
        error: "Sozlamani saqlab bo'lmadi. Qaytadan urinib ko'ring.",
      };
    }
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/**
 * Narx farqi hisobotini hoziroq yuborish (sinov tugmasi). force: true — davr
 * tekshiruvini chetlab o'tadi, aks holda qo'lda bosilganda "allaqachon yuborilgan"
 * deb jim skipped qaytarardi.
 */
export async function narxReportYuborAction(): Promise<
  | { ok: true; count: number; period: string | null; skipped?: boolean }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendNarxReport } = await import("@/lib/narx-report/report");
    const res = await sendNarxReport({ force: true });
    // Yuborilgan bo'lsa oxirgi davr yozildi — blokdagi ko'rsatkich yangilansin
    if (res.ok) revalidatePath(RP);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── 1C do'kon ID → filial bog'lash ────────────────────────────────────────────
// Chekda `shop: 5` keladi, lekin u qaysi filial ekanini faqat inson biladi.
// Biriktirilmagan bo'lsa chek BARIBIR saqlanadi — faqat filialsiz turadi va
// keyin biriktirilgach qayta hisoblanadi.
const onecShopSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  shopId: z.string().trim(), // bo'sh — bog'lashni olib tashlash
});

export async function onecShopBoglaAction(input: {
  branchId: number;
  shopId: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = onecShopSchema.parse(input);
    const { prisma } = await import("@/lib/prisma");

    const qiymat = p.shopId === "" ? null : Number(p.shopId);
    if (qiymat !== null && (!Number.isInteger(qiymat) || qiymat < 0)) {
      return { ok: false, error: "Do'kon ID butun musbat son bo'lishi kerak." };
    }

    // @unique — bitta shop ikki filialga biriktirilmasin (cheklar ikkiga bo'linardi)
    if (qiymat !== null) {
      const band = await prisma.branch.findFirst({
        where: { onecShopId: qiymat, NOT: { id: p.branchId } },
        select: { name: true },
      });
      if (band)
        return {
          ok: false,
          error: `Bu do'kon ID «${band.name}» ga biriktirilgan.`,
        };
    }

    await prisma.branch.update({
      where: { id: p.branchId },
      data: { onecShopId: qiymat },
    });

    // Biriktirilgach — o'sha do'konning filialsiz cheklarini bog'laymiz.
    if (qiymat !== null) {
      await prisma.receipt.updateMany({
        where: { shop: qiymat, branchId: null },
        data: { branchId: p.branchId },
      });
    }

    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── To'lov turi moslashuvi ────────────────────────────────────────────────────
// 1C bergan nom → bizdagi tur. Naqd/plastik ajratish shu yerdan chiqadi,
// shuning uchun tasdiqlash QO'LDA: taxmin xato bo'lsa tushum noto'g'ri bo'linadi.
const tolovTuriSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Turlar ro'yxati BOSHQARILADI (PaymentKindDef) — shuning uchun bu yerda
  // qat'iy enum yo'q, mavjudligi bazadan tekshiriladi.
  kind: z.string().trim().min(1).max(30),
});

// ─── To'lov TURLARI ro'yxati (PaymentKindDef) ─────────────────────────────────

const kindSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(40),
  isCash: z.boolean(),
  tone: z.string().trim().min(1).max(20),
});

/** Yangi to'lov turi. Kod normallashtiriladi va takrorlanmasligi tekshiriladi. */
export async function tolovKindQoshAction(input: {
  code: string;
  name: string;
  isCash: boolean;
  tone: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = kindSchema.parse(input);
    const { kodNormalla, TONE_CODES } =
      await import("@/lib/integratsiya/tolov-turlari");
    const { prisma } = await import("@/lib/prisma");

    const code = kodNormalla(p.code);
    if (!code)
      return {
        ok: false,
        error: "Kod harf yoki raqamdan iborat bo'lishi kerak.",
      };
    if (!TONE_CODES.includes(p.tone))
      return { ok: false, error: "Rang noto'g'ri." };

    const bor = await prisma.paymentKindDef.findUnique({ where: { code } });
    if (bor) return { ok: false, error: `«${code}» kodli tur allaqachon bor.` };

    const oxirgi = await prisma.paymentKindDef.aggregate({
      _max: { sortOrder: true },
      where: { isSystem: false },
    });
    await prisma.paymentKindDef.create({
      data: {
        code,
        name: p.name,
        isCash: p.isCash,
        tone: p.tone,
        // Tizim turlaridan keyin, "Boshqa" (900) dan oldin.
        sortOrder: Math.min(890, (oxirgi._max.sortOrder ?? 100) + 10),
      },
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** Turning NOMI, rangi va "naqdmi" belgisi. Kod o'zgartirilmaydi. */
export async function tolovKindTahrirAction(input: {
  code: string;
  name: string;
  isCash: boolean;
  tone: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = kindSchema.parse(input);
    const { TONE_CODES } = await import("@/lib/integratsiya/tolov-turlari");
    const { prisma } = await import("@/lib/prisma");
    if (!TONE_CODES.includes(p.tone))
      return { ok: false, error: "Rang noto'g'ri." };

    // KOD O'ZGARTIRILMAYDI: cheklarda kod saqlanadi, o'zgarsa ularning turi
    // "yo'q" bo'lib qolardi.
    await prisma.paymentKindDef.update({
      where: { code: p.code },
      data: { name: p.name, isCash: p.isCash, tone: p.tone },
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/**
 * Turni o'chirish. Ikki himoya:
 *  – tizim turlari (Naqd/Plastik/O'tkazma/Boshqa) o'chirilmaydi;
 *  – ishlatilayotgan tur o'chirilmaydi (cheklar va moslashuv jadvali).
 */
export async function tolovKindOchirAction(code: string): Promise<Result> {
  try {
    await requireAdmin();
    const p = z.string().trim().min(1).parse(code);
    const { prisma } = await import("@/lib/prisma");

    const def = await prisma.paymentKindDef.findUnique({ where: { code: p } });
    if (!def) return { ok: false, error: "Tur topilmadi." };
    if (def.isSystem)
      return { ok: false, error: `«${def.name}» — tizim turi, o'chirilmaydi.` };

    const [tolovlar, moslik] = await Promise.all([
      prisma.receiptPayment.count({ where: { kind: p } }),
      prisma.paymentTypeMap.count({ where: { kind: p } }),
    ]);
    if (tolovlar > 0 || moslik > 0) {
      return {
        ok: false,
        error: `«${def.name}» ishlatilyapti (${tolovlar.toLocaleString("uz-UZ")} to'lov, ${moslik} moslik) — avval ularni boshqa turga o'tkazing.`,
      };
    }

    await prisma.paymentKindDef.delete({ where: { code: p } });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/**
 * Qo'lda qo'shilgan to'lov turini o'chirish.
 *
 * FAQAT ISHLATILMAGANINI: agar shu nom bilan chek to'lovi bor bo'lsa, o'chirish
 * ularni turi noma'lum holatga tashlab ketardi va tushum taqsimoti buzilardi.
 * 1C keyin o'sha nomni yuborsa — u avtomatik qayta paydo bo'ladi.
 */
export async function tolovTuriOchirAction(name: string): Promise<Result> {
  try {
    await requireAdmin();
    const p = z.string().trim().min(1).parse(name);
    const { prisma } = await import("@/lib/prisma");

    const ishlatilgan = await prisma.receiptPayment.count({
      where: { name: p },
    });
    if (ishlatilgan > 0) {
      return {
        ok: false,
        error: `«${p}» ${ishlatilgan.toLocaleString("uz-UZ")} ta chekda ishlatilgan — o'chirib bo'lmaydi. Turini o'zgartiring.`,
      };
    }

    await prisma.paymentTypeMap.deleteMany({ where: { name: p } });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

export async function tolovTuriBelgilaAction(input: {
  name: string;
  kind: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = tolovTuriSchema.parse(input);
    const { prisma } = await import("@/lib/prisma");

    // Tur mavjudligini tekshiramiz: aks holda chekka yo'q kod yozilib,
    // hisobotda "noma'lum tur" bo'lib chiqib qolardi.
    const def = await prisma.paymentKindDef.findUnique({
      where: { code: p.kind },
    });
    if (!def) return { ok: false, error: "Bunday to'lov turi yo'q." };

    await prisma.$transaction(async (tx) => {
      await tx.paymentTypeMap.upsert({
        where: { name: p.name },
        create: { name: p.name, kind: p.kind, isConfirmed: true },
        update: { kind: p.kind, isConfirmed: true },
      });
      // ALLAQACHON saqlangan cheklarni ham qayta belgilaymiz — aks holda
      // tuzatish faqat kelajakdagi cheklarga ta'sir qilardi va hisobot
      // eski/yangi aralash bo'lib qolardi.
      await tx.receiptPayment.updateMany({
        where: { name: p.name },
        data: { kind: p.kind },
      });
    });

    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── 1C qabul: IP cheklovi ─────────────────────────────────────────────────────
// "Birinchi kelgan IP" prinsipi: 1C tomonining IP'sini so'rab o'tirmaymiz,
// birinchi muvaffaqiyatli so'rov avtomatik ro'yxatga olinadi. Bu yerda uni
// ko'rish, qo'shish va olib tashlash mumkin.

async function ipRoyxat(): Promise<string[]> {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.appSetting.findUnique({
    where: { key: "onec_allowed_ips" },
  });
  return (row?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ipSaqla(list: string[]): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const v = [...new Set(list)].join(",");
  await prisma.appSetting.upsert({
    where: { key: "onec_allowed_ips" },
    create: { key: "onec_allowed_ips", value: v },
    update: { value: v },
  });
}

const ipSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[0-9a-fA-F.:]+$/, "IP manzil noto'g'ri.");

/** IP'ga ruxsat berish (jurnalda rad etilgan qatordan bir bosishda). */
export async function onecIpRuxsatAction(ip: string): Promise<Result> {
  try {
    await requireAdmin();
    const p = ipSchema.parse(ip);
    await ipSaqla([...(await ipRoyxat()), p]);
    const { prisma } = await import("@/lib/prisma");
    await prisma.onecIpLog.updateMany({
      where: { ip: p },
      data: { allowed: true },
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/** IP'ni ro'yxatdan olib tashlash. */
export async function onecIpOlibTashlaAction(ip: string): Promise<Result> {
  try {
    await requireAdmin();
    const p = ipSchema.parse(ip);
    await ipSaqla((await ipRoyxat()).filter((x) => x !== p));
    const { prisma } = await import("@/lib/prisma");
    await prisma.onecIpLog.updateMany({
      where: { ip: p },
      data: { allowed: false },
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

/**
 * Ro'yxatni butunlay tozalash — keyingi so'rov yana "birinchi" bo'lib
 * ro'yxatga olinadi. 1C serveri ko'chganda/IP o'zgarganda ishlatiladi.
 */
export async function onecIpTozalaAction(): Promise<Result> {
  try {
    await requireAdmin();
    await ipSaqla([]);
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}

// ─── 1C qabul: HMAC imzo ──────────────────────────────────────────────────────

/**
 * Imzoni MAJBURIY qilish/bekor qilish.
 *
 * Yoqishdan oldin ikki shart tekshiriladi, chunki xato yoqish 1C oqimini
 * butunlay to'xtatib qo'yadi:
 *   1. serverda `ONEC_INGEST_SECRET` sozlangan bo'lsin;
 *   2. 1C allaqachon imzolangan so'rov yuborgan bo'lsin (kamida bittasi).
 */
export async function onecImzoTalabAction(yoq: boolean): Promise<Result> {
  try {
    await requireAdmin();
    const { HMAC_REQUIRED_KEY } = await import("@/lib/integratsiya/imzo");
    const { prisma } = await import("@/lib/prisma");

    if (yoq && !process.env.ONEC_INGEST_SECRET) {
      return {
        ok: false,
        error: "Avval serverda ONEC_INGEST_SECRET o'zgaruvchisini sozlang.",
      };
    }

    await prisma.appSetting.upsert({
      where: { key: HMAC_REQUIRED_KEY },
      create: { key: HMAC_REQUIRED_KEY, value: yoq ? "1" : "0" },
      update: { value: yoq ? "1" : "0" },
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) {
    return xato(err);
  }
}
