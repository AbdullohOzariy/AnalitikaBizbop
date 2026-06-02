/**
 * Next ishga tushganda bir marta ishlaydi (server start). Telegram webhook'ni
 * {WEBHOOK_URL}/api/tg/{BOT_TOKEN} ga o'rnatadi. BOT_TOKEN yoki WEBHOOK_URL yo'q
 * bo'lsa — jim o'tkazib yuboradi. Faqat Node.js runtime'da.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const token = process.env.BOT_TOKEN;
  const base = (process.env.WEBHOOK_URL || "").replace(/\/$/, "");
  if (!token || !base) {
    console.warn("[instrumentation] BOT_TOKEN yoki WEBHOOK_URL yo'q — webhook o'rnatilmadi");
    return;
  }

  try {
    const { getBot } = await import("@/lib/spisaniya/bot");
    const bot = getBot();
    if (!bot) return;
    const url = `${base}/api/tg/${token}`;
    await bot.telegram.setWebhook(url);
    console.log(`[instrumentation] Webhook o'rnatildi: ${base}/api/tg/***`);
  } catch (err) {
    console.error("[instrumentation] Webhook xatosi:", err instanceof Error ? err.message : err);
  }
}
