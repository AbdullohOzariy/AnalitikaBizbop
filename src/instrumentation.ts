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

  // Kunlik inventarizatsiya hisoboti — har kuni 14:00 (Toshkent): qoldig'i 0/minus,
  // lekin sotuvi bor muammoli tovarlar Excel'i sozlangan guruhga yuboriladi.
  // node-cron faqat Node runtime'da; dublikat ro'yxatdan o'tishni globalThis bilan oldini olamiz.
  {
    const gg = globalThis as typeof globalThis & { __invReportCron?: boolean };
    if (!gg.__invReportCron) {
      gg.__invReportCron = true;
      try {
        const { schedule } = await import("node-cron");
        schedule("0 14 * * *", async () => {
          try {
            const { sendInventoryReport } = await import("@/lib/inventory-report/report");
            const r = await sendInventoryReport();
            if (!r.ok) console.warn("[inv-report] yuborilmadi:", r.error);
            else console.log(`[inv-report] yuborildi: ${r.count} ta muammoli SKU`);
          } catch (e) {
            console.error("[inv-report] xato:", e instanceof Error ? e.message : e);
          }
        }, { timezone: "Asia/Tashkent" });
        console.log("[instrumentation] Inventarizatsiya cron o'rnatildi: har kuni 14:00 (Asia/Tashkent)");
      } catch (e) {
        console.warn("[instrumentation] inv-report cron o'rnatilmadi:", e instanceof Error ? e.message : e);
      }
    }
  }

  // Kunlik MARJA hisoboti — har kuni 15:00 (Toshkent): oxirgi davr filial×subkat
  // marjasi minus (tannarx > sotuv) kataklari Excel'i. Faqat sozlamada YOQILGAN bo'lsa.
  {
    const gg = globalThis as typeof globalThis & { __marginReportCron?: boolean };
    if (!gg.__marginReportCron) {
      gg.__marginReportCron = true;
      try {
        const { schedule } = await import("node-cron");
        schedule("0 15 * * *", async () => {
          try {
            const { getMarginReportConfig } = await import("@/lib/margin-report/sozlama");
            const cfg = await getMarginReportConfig();
            if (!cfg.autoEnabled) return; // avto yuborish o'chirilgan
            const { sendMarginReport } = await import("@/lib/margin-report/report");
            const r = await sendMarginReport();
            if (!r.ok) console.warn("[margin-report] yuborilmadi:", r.error);
            else console.log(`[margin-report] yuborildi: ${r.count} ta filial×subkat`);
          } catch (e) {
            console.error("[margin-report] xato:", e instanceof Error ? e.message : e);
          }
        }, { timezone: "Asia/Tashkent" });
        console.log("[instrumentation] Marja cron o'rnatildi: har kuni 15:00 (Asia/Tashkent)");
      } catch (e) {
        console.warn("[instrumentation] margin-report cron o'rnatilmadi:", e instanceof Error ? e.message : e);
      }
    }
  }

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
