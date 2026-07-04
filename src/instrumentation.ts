/**
 * Next ishga tushganda bir marta ishlaydi (server start). Kunlik cron hisobotlar,
 * kesh isitish va Telegram webhook'ni o'rnatadi. Faqat Node.js runtime'da.
 */
import { nowTashkent } from "@/lib/date";

/** Kunlik cron ishlari — nomi, jadvali (Toshkent soat:daqiqa) va bajaruvchisi. */
type CronJob = { name: string; cron: string; hour: number; minute: number; run: () => Promise<void> };

const JOBS: CronJob[] = [
  // 14:00 — inventarizatsiya: so'nggi kun bo'yicha muammoli (qoldiq 0/minus, sotuvi bor) tovarlar.
  {
    name: "inv-report", cron: "0 14 * * *", hour: 14, minute: 0,
    run: async () => {
      const { sendInventoryReport } = await import("@/lib/inventory-report/report");
      const r = await sendInventoryReport();
      if (!r.ok) throw new Error(r.error || "yuborilmadi");
      console.log(`[inv-report] yuborildi: ${r.count} ta muammoli SKU`);
    },
  },
  // 15:00 — marja minus (tannarx > sotuv) kataklari. Faqat sozlamada YOQILGAN bo'lsa.
  {
    name: "margin-report", cron: "0 15 * * *", hour: 15, minute: 0,
    run: async () => {
      const { getMarginReportConfig } = await import("@/lib/margin-report/sozlama");
      if (!(await getMarginReportConfig()).autoEnabled) return;
      const { sendMarginReport } = await import("@/lib/margin-report/report");
      const r = await sendMarginReport();
      if (!r.ok) throw new Error(r.error || "yuborilmadi");
      console.log(`[margin-report] yuborildi: ${r.count} ta filial×subkat`);
    },
  },
  // 10:00 — yetkazib berish kechikishi (kutilgan sanadan o'tgan zakazlar). Sozlama + bo'sh bo'lsa jim.
  {
    name: "delivery-alert", cron: "0 10 * * *", hour: 10, minute: 0,
    run: async () => {
      const { getDeliveryAlertConfig } = await import("@/lib/delivery-alert/sozlama");
      if (!(await getDeliveryAlertConfig()).autoEnabled) return;
      const { sendDeliveryAlert } = await import("@/lib/delivery-alert/report");
      const r = await sendDeliveryAlert({ skipIfEmpty: true });
      if (!r.ok) throw new Error(r.error || "yuborilmadi");
      if (r.skipped) console.log("[delivery-alert] kechikkan zakaz yo'q — o'tkazib yuborildi");
      else console.log(`[delivery-alert] yuborildi: ${r.count} ta kechikkan zakaz`);
    },
  },
  // 09:00 — muddati o'tgan FAOL aksiyalarni ENDED qilish (Telegram'siz).
  {
    name: "promo-end", cron: "0 9 * * *", hour: 9, minute: 0,
    run: async () => {
      const { endExpiredPromos } = await import("@/lib/promo-jobs");
      const n = await endExpiredPromos();
      if (n > 0) console.log(`[promo-end] ${n} ta muddati o'tgan aksiya ENDED qilindi`);
    },
  },
  // 09:30 — spisaniya kunlik indikatori (kechagi kun bo'yicha). Faqat YOQILGAN bo'lsa.
  {
    name: "spisaniya-daily", cron: "30 9 * * *", hour: 9, minute: 30,
    run: async () => {
      const { getSpisaniyaDailyConfig } = await import("@/lib/spisaniya-daily/sozlama");
      if (!(await getSpisaniyaDailyConfig()).autoEnabled) return;
      const { sendSpisaniyaDailyReport } = await import("@/lib/spisaniya-daily/report");
      const r = await sendSpisaniyaDailyReport();
      if (!r.ok) throw new Error(r.error || "yuborilmadi");
      console.log(`[spisaniya-daily] yuborildi: jami ${r.total}`);
    },
  },
];

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Deploy/restart'dan keyin fonda: (1) SKU matritsa sinflari (backfill), (2) kesh isitish.
  (async () => {
    const { updateProductMatrixClasses } = await import("@/lib/abc-xyz");
    await updateProductMatrixClasses();
    const { warmAnalyticsCaches } = await import("@/lib/warm");
    await warmAnalyticsCaches("server-start");
  })().catch((err) =>
    console.warn("[instrumentation] warm/sinf xatosi:", err instanceof Error ? err.message : err)
  );

  // ── Kunlik cron ishlari — dublikat ro'yxatdan o'tishni globalThis bilan oldini olamiz ──
  const gg = globalThis as typeof globalThis & { __cronRegistered?: boolean };
  if (!gg.__cronRegistered) {
    gg.__cronRegistered = true;
    try {
      const { schedule } = await import("node-cron");
      const { runCron } = await import("@/lib/cron");
      for (const job of JOBS) {
        schedule(job.cron, () => void runCron(job.name, job.run), { timezone: "Asia/Tashkent" });
      }
      console.log(`[instrumentation] ${JOBS.length} ta cron o'rnatildi (Asia/Tashkent)`);

      // CATCH-UP: server o'sha vaqtda o'chiq bo'lgan bo'lsa, bugungi vaqti o'tgan ishlarni
      // bir marta bajaramiz. runCron dedup qiladi — allaqachon bajarilgan bo'lsa jim chiqadi.
      const now = nowTashkent();
      const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
      for (const job of JOBS) {
        if (nowMin >= job.hour * 60 + job.minute) {
          void runCron(job.name, job.run).catch((e) =>
            console.error(`[cron:${job.name}] catch-up xato:`, e instanceof Error ? e.message : e)
          );
        }
      }
    } catch (e) {
      console.warn("[instrumentation] cron o'rnatilmadi:", e instanceof Error ? e.message : e);
    }
  }

  // ── Telegram webhook ──
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
    const url = `${base}/api/tg`;
    await bot.telegram.setWebhook(url, { secret_token: secret });
    console.log(`[instrumentation] Webhook o'rnatildi: ${url} (secret_token bilan)`);
  } catch (err) {
    console.error("[instrumentation] Webhook xatosi:", err instanceof Error ? err.message : err);
  }
}
