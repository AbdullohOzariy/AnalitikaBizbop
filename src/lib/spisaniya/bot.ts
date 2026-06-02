/**
 * Telegram bot (Telegraf) — endi alohida servis emas, shu Next ilova ichida (webhook rejimi).
 *
 * Botni faqat Node runtime'da ishlatamiz (route handler `runtime = "nodejs"`).
 * Singleton: globalThis orqali (dev HMR / qayta yuklashda dublikat bo'lmasin).
 * BOT_TOKEN yo'q bo'lsa getBot() null qaytaradi — chaqiruvchi jim o'tkazib yuboradi.
 */
import { Telegraf, Markup } from "telegraf";

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

  bot.start((ctx) => {
    const ism = ctx.from?.first_name || "Xodim";
    const url = miniAppUrl();
    return ctx.reply(
      `Salom, ${ism}!\nYangi yozuv qo'shish uchun tugmani bosing.`,
      Markup.inlineKeyboard([[Markup.button.webApp("📝 Yangi yozuv", url)]])
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
