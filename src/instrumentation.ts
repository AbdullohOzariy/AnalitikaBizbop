/**
 * Next ishga tushganda bir marta ishlaydi (server start). Telegram webhook'ni
 * {WEBHOOK_URL}/api/tg/{BOT_TOKEN} ga o'rnatadi. BOT_TOKEN yoki WEBHOOK_URL yo'q
 * bo'lsa — jim o'tkazib yuboradi. Faqat Node.js runtime'da.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Deploy/restart'dan keyin fonda: (1) SKU matritsa sinflari (backfill ham shu yerda),
  // (2) kesh isitish — birinchi tashrifchi og'ir hisobni kutmasin. Startup bloklanmaydi.
  (async () => {
    const { updateProductMatrixClasses } = await import("@/lib/abc-xyz");
    await updateProductMatrixClasses();
    const { warmAnalyticsCaches } = await import("@/lib/warm");
    await warmAnalyticsCaches("server-start");
  })().catch((err) =>
    console.warn("[instrumentation] warm/sinf xatosi:", err instanceof Error ? err.message : err)
  );

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
