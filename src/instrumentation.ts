/**
 * Next ishga tushganda bir marta ishlaydi (server start). Telegram webhook'ni
 * {WEBHOOK_URL}/api/tg/{BOT_TOKEN} ga o'rnatadi. BOT_TOKEN yoki WEBHOOK_URL yo'q
 * bo'lsa — jim o'tkazib yuboradi. Faqat Node.js runtime'da.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Kesh isitish — deploy/restart'dan keyin birinchi tashrifchi og'ir hisobni
  // kutmasin. Fonda (startup'ni bloklamaydi), xato bo'lsa faqat log.
  import("@/lib/warm")
    .then((m) => m.warmAnalyticsCaches("server-start"))
    .catch((err) => console.warn("[instrumentation] warm xatosi:", err instanceof Error ? err.message : err));

  const token = process.env.BOT_TOKEN;
  const base = (process.env.WEBHOOK_URL || "").replace(/\/$/, "");
  if (!token || !base) {
    console.warn("[instrumentation] BOT_TOKEN yoki WEBHOOK_URL yo'q — webhook o'rnatilmadi");
    return;
  }

  try {
    const { getBot, webhookSecret } = await import("@/lib/spisaniya/bot");
    const bot = getBot();
    const secret = webhookSecret();
    if (!bot || !secret) return;
    // Token URL'da emas — secret_token header orqali tasdiqlanadi.
    const url = `${base}/api/tg`;
    await bot.telegram.setWebhook(url, { secret_token: secret });
    console.log(`[instrumentation] Webhook o'rnatildi: ${url} (secret_token bilan)`);
  } catch (err) {
    console.error("[instrumentation] Webhook xatosi:", err instanceof Error ? err.message : err);
  }
}
