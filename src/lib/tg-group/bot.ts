/**
 * Mijozlar guruhi boti — ALOHIDA bot (GROUP_BOT_TOKEN), spisaniya botidan mustaqil.
 *
 * NEGA alohida: guruhdagi oddiy xabarlarni ko'rish uchun BotFather'da Privacy mode
 * o'chirilishi shart, u esa botga GLOBAL sozlama. Spisaniya botida o'chirsak, u ham
 * barcha guruhlarda hamma xabarni ola boshlardi — keraksiz yuk va ortiqcha ma'lumot.
 *
 * Bu bot faqat TINGLAYDI: guruhga hech narsa yozmaydi, javob bermaydi.
 */
import crypto from "crypto";
import { Telegraf } from "telegraf";
import type { Message } from "telegraf/types";
import { prisma } from "@/lib/prisma";
import { TASHKENT_OFFSET_MS, isoDay } from "@/lib/date";

/** Webhook `secret_token` — GROUP_BOT_TOKEN'dan hosil qilingan barqaror qiymat (tokenning o'zi EMAS). */
export function groupWebhookSecret(): string | null {
  const t = process.env.GROUP_BOT_TOKEN;
  return t ? crypto.createHash("sha256").update(t).digest("hex") : null;
}

type G = typeof globalThis & {
  __tgGroupBot?: Telegraf | null;
  __tgKnownGroups?: Set<string>;
};
const g = globalThis as G;

/** FK uchun TgGroup mavjudligini kafolatlaydi. Cache — har xabarda upsert qilmaslik uchun. */
async function ensureGroup(chatId: bigint, title: string | null): Promise<void> {
  g.__tgKnownGroups ??= new Set<string>();
  const key = chatId.toString();
  if (g.__tgKnownGroups.has(key)) return;
  await prisma.tgGroup.upsert({
    where: { chatId },
    create: { chatId, title },
    update: title ? { title } : {},
  });
  g.__tgKnownGroups.add(key);
}

/** Telegram xabaridan media turini aniqlaydi (matnsiz murojaatlar ham hisobga olinsin). */
function mediaKindOf(msg: Message): string | null {
  if ("photo" in msg) return "photo";
  if ("video" in msg) return "video";
  if ("voice" in msg) return "voice";
  if ("video_note" in msg) return "video_note";
  if ("audio" in msg) return "audio";
  if ("animation" in msg) return "animation";
  if ("sticker" in msg) return "sticker";
  if ("document" in msg) return "document";
  return null;
}

function textOf(msg: Message): string {
  if ("text" in msg && typeof msg.text === "string") return msg.text;
  if ("caption" in msg && typeof msg.caption === "string") return msg.caption;
  return "";
}

/** Guruh xabarini arxivga yozadi. Idempotent — Telegram retry yuborsa dublikat bo'lmaydi. */
async function saveMessage(msg: Message, edited: boolean): Promise<void> {
  const chat = msg.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") return; // shaxsiy chat — bizga kerak emas

  const text = textOf(msg).trim();
  const mediaKind = mediaKindOf(msg);
  if (!text && !mediaKind) return; // xizmat xabari (kirdi/chiqdi) — tahlilga hissa qo'shmaydi

  const chatId = BigInt(chat.id);
  await ensureGroup(chatId, "title" in chat ? chat.title : null);

  const sentAt = new Date(msg.date * 1000);
  const from = msg.from;
  const data = {
    chatId,
    messageId: msg.message_id,
    threadId: "message_thread_id" in msg ? (msg.message_thread_id ?? null) : null,
    sentAt,
    dayKey: isoDay(new Date(sentAt.getTime() + TASHKENT_OFFSET_MS)),
    fromId: from ? BigInt(from.id) : null,
    fromName: from
      ? [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 120) ||
        (from.username ?? null)
      : null,
    fromBot: from?.is_bot ?? false,
    text,
    mediaKind,
    replyToId:
      "reply_to_message" in msg && msg.reply_to_message
        ? msg.reply_to_message.message_id
        : null,
    editedAt: edited ? new Date() : null,
    source: "LIVE",
  };

  await prisma.tgGroupMessage.upsert({
    where: { chatId_messageId: { chatId, messageId: msg.message_id } },
    create: data,
    // Tahrir: matn yangilanadi, sentAt/muallif o'zgarmaydi (tarix buzilmasin).
    update: edited ? { text, mediaKind, editedAt: new Date() } : {},
  });
}

function buildBot(): Telegraf | null {
  const token = process.env.GROUP_BOT_TOKEN;
  if (!token) return null;

  const bot = new Telegraf(token);

  bot.on("message", async (ctx) => {
    try {
      await saveMessage(ctx.message, false);
    } catch (e) {
      console.error("[tg-group] saqlash xatosi:", e instanceof Error ? e.message : e);
    }
  });

  bot.on("edited_message", async (ctx) => {
    try {
      await saveMessage(ctx.editedMessage, true);
    } catch (e) {
      console.error("[tg-group] tahrir saqlash xatosi:", e instanceof Error ? e.message : e);
    }
  });

  // Guruhga qo'shilgan/chiqarilgan payt — TgGroup ochamiz/passiv qilamiz.
  bot.on("my_chat_member", async (ctx) => {
    const { chat, new_chat_member } = ctx.myChatMember;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    const chatId = BigInt(chat.id);
    const active = !["left", "kicked"].includes(new_chat_member.status);
    try {
      await prisma.tgGroup.upsert({
        where: { chatId },
        create: { chatId, title: chat.title, active },
        update: { title: chat.title, active },
      });
      g.__tgKnownGroups?.delete(chatId.toString());
      console.log(`[tg-group] "${chat.title}" (${chatId}) → ${active ? "ulandi" : "chiqarildi"}`);
    } catch (e) {
      console.error("[tg-group] my_chat_member xatosi:", e instanceof Error ? e.message : e);
    }
  });

  return bot;
}

export function getGroupBot(): Telegraf | null {
  if (g.__tgGroupBot === undefined) g.__tgGroupBot = buildBot();
  return g.__tgGroupBot;
}
