"use server";

import { revalidatePath } from "next/cache";
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

type Result = { ok: true } | { ok: false; error: string };

function xato(err: unknown): Result {
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  // Postgres unique violation / FK violation — tushunarli xabar
  if (msg.includes("duplicate key") || msg.includes("23505"))
    return { ok: false, error: "Bunday nom allaqachon mavjud." };
  if (msg.includes("foreign key") || msg.includes("23503"))
    return { ok: false, error: "Bu filialda yozuvlar bor — o'chirib bo'lmaydi (o'rniga nofaol qiling)." };
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
  } catch (err) { return xato(err); }
}

const filialPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  nomi: z.string().trim().min(1).max(100).optional(),
  aktiv: z.boolean().optional(),
  // topic_id — raqam yoki bo'sh (null = topic yo'q)
  topic_id: z.string().trim().regex(/^-?\d*$/, "Faqat raqam").optional(),
});

export async function filialYangilaAction(input: {
  id: number; nomi?: string; aktiv?: boolean; topic_id?: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const p = filialPatchSchema.parse(input);
    await filialYangila(p.id, {
      nomi: p.nomi,
      aktiv: p.aktiv,
      topic_id: p.topic_id === undefined ? undefined : (p.topic_id || null),
    });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function filialOchirAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    await filialOchir(z.coerce.number().int().positive().parse(id));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

// ─── Guruh chat_id ──────────────────────────────────────────────────────────────
const chatIdSchema = z.string().trim().regex(/^-?\d+$/, "Chat ID raqam bo'lishi kerak");

export async function guruhSaqlaAction(chatId: string): Promise<Result> {
  try {
    await requireAdmin();
    await guruhChatIdSaqla(chatIdSchema.parse(chatId));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

// ─── Bot foydalanuvchilari (whitelist) ────────────────────────────────────────
const tgIdSchema = z.string().trim().regex(/^\d{5,15}$/, "Telegram ID — 5-15 raqam");

export async function ruxsatQoshishAction(input: { telegramId: string; ism?: string }): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const telegramId = tgIdSchema.parse(input.telegramId);
    const ism = (input.ism ?? "").trim().slice(0, 100) || null;
    await ruxsatQoshish(telegramId, ism, admin.name?.trim() || admin.email || "admin");
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function ruxsatToggleAction(telegramId: string, aktiv: boolean): Promise<Result> {
  try {
    await requireAdmin();
    await ruxsatToggle(tgIdSchema.parse(telegramId), aktiv);
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function ruxsatOchirAction(telegramId: string): Promise<Result> {
  try {
    await requireAdmin();
    await ruxsatOchir(tgIdSchema.parse(telegramId));
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}


/** Sverka guruh chat ID'sini saqlash (asosiy baza, AppSetting). */
export async function sverkaGuruhSaqlaAction(chatId: string): Promise<Result> {
  try {
    await requireAdmin();
    const v = chatId.trim();
    if (v && !/^-?\d{5,20}$/.test(v)) {
      return { ok: false, error: "Chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida)." };
    }
    const { setSverkaGroupChatId } = await import("@/lib/sverka/sozlama");
    await setSverkaGroupChatId(v);
    revalidatePath("/admin/sozlamalar");
    return { ok: true };
  } catch (err) { return xato(err); }
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
  } catch (err) { return xato(err); }
}


/** Sverka "Qabul qildi" ro'yxati — ism qo'shish. */
export async function sverkaQabulchiQoshAction(ism: string): Promise<Result> {
  try {
    await requireAdmin();
    const nm = z.string().trim().min(1, "Ism kiriting").max(120).parse(ism);
    const { prisma } = await import("@/lib/prisma");
    await prisma.sverkaQabulchi.upsert({ where: { ism: nm }, create: { ism: nm }, update: {} });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function sverkaQabulchiOchirAction(id: number): Promise<Result> {
  try {
    await requireAdmin();
    const qid = z.coerce.number().int().positive().parse(id);
    const { prisma } = await import("@/lib/prisma");
    await prisma.sverkaQabulchi.delete({ where: { id: qid } });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}


// ─── Inventarizatsiya xabarnoma bot (kunlik muammoli tovarlar hisoboti) ─────────

/** Bot token + guruh chat id + topic id'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function inventoryReportSaqlaAction(input: {
  token: string; chatId: string; topicId: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return { ok: false, error: "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi)." };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return { ok: false, error: "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida)." };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return { ok: false, error: "Bot token noto'g'ri (123456:ABC... ko'rinishida)." };
    }
    const { setInventoryReportConfig } = await import("@/lib/inventory-report/sozlama");
    await setInventoryReportConfig({ token, chatId, topicId });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
}

/** Hisobotni hoziroq yuborish (sinov tugmasi). Yuborilgan muammoli SKU sonini qaytaradi. */
export async function inventoryReportYuborAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const { sendInventoryReport } = await import("@/lib/inventory-report/report");
    return await sendInventoryReport();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Marja (marjasi minus filial×subkat) xabarnoma bot ─────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function marginReportSaqlaAction(input: {
  token: string; chatId: string; topicId: string; autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return { ok: false, error: "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi)." };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return { ok: false, error: "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida)." };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return { ok: false, error: "Bot token noto'g'ri (123456:ABC... ko'rinishida)." };
    }
    const { setMarginReportConfig } = await import("@/lib/margin-report/sozlama");
    await setMarginReportConfig({ token, chatId, topicId, autoEnabled: !!input.autoEnabled });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
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
    const msg = err instanceof Error ? err.message : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}

// ─── Yetkazib berish kechikishi signali ────────────────────────────────────────

/** Bot token + guruh chat id + topic id + avto-yoqish'ni saqlash. token bo'sh — o'zgartirilmaydi. */
export async function deliveryAlertSaqlaAction(input: {
  token: string; chatId: string; topicId: string; autoEnabled: boolean;
}): Promise<Result> {
  try {
    await requireAdmin();
    const token = input.token.trim();
    const chatId = input.chatId.trim();
    const topicId = input.topicId.trim();
    if (!chatId) {
      return { ok: false, error: "Guruh chat ID kiritilishi shart (bo'sh saqlasangiz xabarnoma o'chadi)." };
    }
    if (!/^-?\d{5,20}$/.test(chatId)) {
      return { ok: false, error: "Guruh chat ID raqam bo'lishi kerak (odatda -100... ko'rinishida)." };
    }
    if (topicId && !/^\d{1,12}$/.test(topicId)) {
      return { ok: false, error: "Topic ID musbat raqam bo'lishi kerak." };
    }
    if (token && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return { ok: false, error: "Bot token noto'g'ri (123456:ABC... ko'rinishida)." };
    }
    const { setDeliveryAlertConfig } = await import("@/lib/delivery-alert/sozlama");
    await setDeliveryAlertConfig({ token, chatId, topicId, autoEnabled: !!input.autoEnabled });
    revalidatePath(RP);
    return { ok: true };
  } catch (err) { return xato(err); }
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
    const msg = err instanceof Error ? err.message : "Xato.";
    return { ok: false, error: msg.includes("Ruxsat") ? "Ruxsat yo'q." : msg };
  }
}
