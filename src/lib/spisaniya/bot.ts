/**
 * Telegram bot (Telegraf) — endi alohida servis emas, shu Next ilova ichida (webhook rejimi).
 *
 * Botni faqat Node runtime'da ishlatamiz (route handler `runtime = "nodejs"`).
 * Singleton: globalThis orqali (dev HMR / qayta yuklashda dublikat bo'lmasin).
 * BOT_TOKEN yo'q bo'lsa getBot() null qaytaradi — chaqiruvchi jim o'tkazib yuboradi.
 */
import crypto from "crypto";
import { Telegraf, Markup } from "telegraf";
import { ruxsatBormi } from "./db";

/**
 * Telegram webhook `secret_token` — BOT_TOKEN'dan hosil qilingan barqaror qiymat
 * (tokenning o'zi EMAS). setWebhook'da o'rnatiladi, har update'da header orqali tekshiriladi.
 * Shu tufayli BOT_TOKEN webhook URL'ida turmaydi (loglarga sizmaydi).
 */
export function webhookSecret(): string | null {
  const t = process.env.BOT_TOKEN;
  return t ? crypto.createHash("sha256").update(t).digest("hex") : null;
}

type G = typeof globalThis & { __spisaniyaBot?: Telegraf | null };
const g = globalThis as G;

function miniAppUrl(): string {
  const base = (process.env.WEBHOOK_URL || "").replace(/\/$/, "");
  return `${base}/miniapp/index.html`;
}

function buildBot(): Telegraf | null {
  const token = process.env.BOT_TOKEN;
  if (!token) return null;

  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const ism = ctx.from?.first_name || "Xodim";
    const id = ctx.from?.id;

    const allowed = id ? await ruxsatBormi(id) : false;
    if (allowed) {
      const url = miniAppUrl();
      const base = (process.env.WEBHOOK_URL || "").replace(/\/$/, "");
      return ctx.reply(
        `Salom, ${ism}!\n🆔 Sizning ID: ${id}\n\nBo'limni tanlang:`,
        Markup.inlineKeyboard([
          [Markup.button.webApp("📝 Spisaniya yozuvi", url)],
          [Markup.button.webApp("📑 Sverka kiritish", `${base}/miniapp/sverka`)],
        ])
      );
    }

    // Ruxsat yo'q — foydalanuvchi ID'sini xabar qilamiz (adminga yuborish uchun).
    return ctx.reply(
      `Salom, ${ism.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}!\n🆔 Sizning ID: <code>${id}</code>\n\n` +
        `Botdan foydalanish uchun ruxsat kerak. Iltimos, shu ID'ni adminga yuborib, ruxsat oling.`,
      { parse_mode: "HTML" }
    );
  });

  bot.command("panel", (ctx) => {
    const adminIds = (process.env.ADMIN_IDS || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Boolean);
    if (!adminIds.includes(ctx.from?.id ?? -1)) {
      return ctx.reply("Ruxsat yo'q.");
    }
    const base = (process.env.WEBHOOK_URL || "").replace(/\/$/, "");
    return ctx.reply(
      "Nazorat paneli:",
      Markup.inlineKeyboard([[Markup.button.url("Panelni ochish", `${base}/chiqim`)]])
    );
  });

  return bot;
}

/** Bot singleton — token yo'q bo'lsa null. */
export function getBot(): Telegraf | null {
  if (g.__spisaniyaBot === undefined) {
    g.__spisaniyaBot = buildBot();
  }
  return g.__spisaniyaBot ?? null;
}

export function botTokenConfigured(): boolean {
  return !!process.env.BOT_TOKEN;
}

/** Telegram fayl uchun to'g'ridan-to'g'ri yuklab olish havolasi (rasm preview). */
export async function telegramFileUrl(fileId: string): Promise<string | null> {
  const bot = getBot();
  const token = process.env.BOT_TOKEN;
  if (!bot || !token) return null;
  try {
    const file = await bot.telegram.getFile(fileId);
    return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  } catch {
    return null;
  }
}
