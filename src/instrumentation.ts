/**
 * Next ishga tushganda bir marta ishlaydi (server start). Kunlik cron hisobotlar,
 * kesh isitish va Telegram webhook'ni o'rnatadi. Faqat Node.js runtime'da.
 */
import { nowTashkent } from "@/lib/date";

/**
 * Cron ishlari — nomi, jadvali (Toshkent soat:daqiqa) va bajaruvchisi.
 * `weekday` (0=yakshanba … 6=shanba) — HAFTALIK ish uchun SHART: `runCron` dedup'i
 * kun bo'yicha ishlaydi, shuning uchun weekday'siz haftalik ish catch-up'da har kuni
 * qayta ishga tushib ketardi.
 */
type CronJob = {
  name: string;
  cron: string;
  hour: number;
  minute: number;
  weekday?: number;
  run: () => Promise<void>;
};

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
  // 11:00 — filiallar narx farqi (bir SKU turli filialda turli narxda) PDF. Faqat sozlamada
  // YOQILGAN bo'lsa: aks holda sozlanmagan tizimda har kuni "cron bajarilmadi" alerti kelardi.
  // Yangi sotuv fayli yuklanmagan bo'lsa davr o'zgarmaydi va report jim chiqadi.
  {
    name: "narx-report", cron: "0 11 * * *", hour: 11, minute: 0,
    run: async () => {
      const { getNarxReportConfig } = await import("@/lib/narx-report/sozlama");
      if (!(await getNarxReportConfig()).autoEnabled) return;
      const { sendNarxReport } = await import("@/lib/narx-report/report");
      const r = await sendNarxReport();
      if (!r.ok) throw new Error(r.error || "yuborilmadi");
      if (r.skipped) console.log(`[narx-report] o'tkazib yuborildi (davr: ${r.period ?? "yo'q"})`);
      else console.log(`[narx-report] yuborildi: ${r.count} ta SKU (davr: ${r.period})`);
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
  // 03:30 — Community: KECHAGI kunni AI bilan tahlil qilish (kun yopilgach) va
  // so'ralgan nomlarni SKU/subkategoriyaga moslashtirish. Faqat YOQILGAN bo'lsa —
  // aks holda sozlanmagan tizimda har kuni "cron bajarilmadi" alerti kelardi.
  // 03:00 dagi access-cleanup bilan ustma-ust tushmasin uchun 30 daqiqa surilgan.
  {
    name: "community-ai", cron: "30 3 * * *", hour: 3, minute: 30,
    run: async () => {
      const { getCommunityConfig, tahlilChatId } = await import("@/lib/community/sozlama");
      if (!(await getCommunityConfig()).autoEnabled) return;
      const chatId = await tahlilChatId();
      if (chatId == null) return;

      const { isoDay, nowTashkent } = await import("@/lib/date");
      const kecha = isoDay(new Date(nowTashkent().getTime() - 86_400_000));

      const { analizQil } = await import("@/lib/community/analiz");
      const r = await analizQil({ chatId, dayKey: kecha });
      const { moslashtir } = await import("@/lib/community/match");
      const m = await moslashtir({ dayKey: kecha });

      console.log(
        `[community-ai] ${kecha}: ${r.windows} oyna → ${r.requests} so'rov ` +
          `(kanon: ${m.kanon}, yangi: ${m.yangiKanon}, kategoriya: ${m.categorized})`
      );
      if (r.errors > 0) throw new Error(`${r.errors} oyna tahlil qilinmadi`);
    },
  },
  // SESHANBA 05:00 — SKU talab prognozi (haftalik). Nega seshanba: origin — yakshanba
  // bilan tugagan TO'LIQ hafta, uning oxirgi kuni importi dushanba kuni keladi. Dushanba
  // ertalab yuritilsa panel hali chala bo'lib, prognoz bir hafta eski origin'dan chiqardi.
  // Og'ir ish (≈45 ming seriya o'qish, ≈27 ming qator yozish) — kunduzgi yukdan oldin.
  {
    name: "prognoz-weekly", cron: "0 5 * * 2", hour: 5, minute: 0, weekday: 2,
    run: async () => {
      const { prognozYugur } = await import("@/lib/prognoz/hisobla");
      const r = await prognozYugur();
      console.log(
        `[prognoz-weekly] origin ${r.origin} (${r.panelWeeks} hafta): ` +
          `${r.yangi ? `${r.forecasted} prognoz` : "allaqachon hisoblangan"}, ` +
          `KAM ${r.skippedKam}, arxiv ${r.skippedArch}; ` +
          `baho: ${r.baholanganRun} run / ${r.baholanganQator} qator; ` +
          `tozalandi: ${r.tozalandi.prognoz}/${r.tozalandi.aniqlik}`
      );
    },
  },
  // 03:00 — kirishlar jurnalini tozalash (1 yildan eskisi). Tunda: paketli
  // DELETE kunduzgi so'rovlarga xalaqit qilmasin.
  {
    name: "access-cleanup", cron: "0 3 * * *", hour: 3, minute: 0,
    run: async () => {
      const { cleanupAccessLog } = await import("@/lib/access-log/cleanup");
      const r = await cleanupAccessLog();
      if (r.events || r.sessions) {
        console.log(`[access-cleanup] ${r.events} hodisa, ${r.sessions} sessiya o'chirildi`);
      }
    },
  },
];

/**
 * Reys qulfi PARTIAL UNIQUE indekslarga tayanadi — ular schema.prisma da
 * ifodalanmaydi, migratsiyaga qo'lda yozilgan. Keyingi `prisma migrate dev`
 * ularni "ortiqcha" deb DROP qilishi mumkin va BUNI HECH QANDAY TEST USHLAMAYDI:
 * ikki haydovchi bitta mashinani bir vaqtda band qila boshlaydi, xato esa faqat
 * ma'lumot buzilgandan keyin bilinadi. Shuning uchun har deployda tekshiramiz.
 */
const QULF_INDEKSLARI = [
  "Trip_open_per_vehicle_uniq",
  "Trip_open_per_driver_uniq",
  "TripLeg_open_per_trip_uniq",
] as const;

async function reysQulfiniTekshir() {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${[...QULF_INDEKSLARI]})
  `;
  const bor = new Set(rows.map((r) => r.indexname));
  const yoq = QULF_INDEKSLARI.filter((n) => !bor.has(n));
  if (yoq.length === 0) return;

  const xabar =
    `Reys QULF indekslari yo'q: ${yoq.join(", ")}. ` +
    `Bitta avtoni ikki haydovchi bir vaqtda band qilishi mumkin — migratsiyani tekshiring.`;
  console.error(`[instrumentation] ⚠️ ${xabar}`);
  try {
    const { notifyAdmin } = await import("@/lib/cron");
    await notifyAdmin(`⚠️ <b>Logistika</b>\n${xabar}`);
  } catch {
    /* alert yuborilmasa ham log qoldi */
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Qulf invariantini tekshirish (xatoni ANIQLAYDI, oldini olmaydi) — fonda.
  void reysQulfiniTekshir().catch((err) =>
    console.warn("[instrumentation] qulf tekshiruvi:", err instanceof Error ? err.message : err)
  );

  // bizbop (bot) bazasi sxemasi — Prisma migratsiyalari bu bazani BOSHQARMAYDI, ustunlar
  // `ensureSozlamalarSchema` ichida ADD COLUMN IF NOT EXISTS bilan qo'shiladi. Ilgari u
  // faqat YOZISH yo'lida (insertYozuv) chaqirilardi: yangi ustun qo'shilgan deploydan keyin
  // birinchi yozuv kelgunicha uni SELECT qiladigan ro'yxat xato berib bo'sh chiqardi.
  // Shu sabab start'da bir marta ishlatamiz (idempotent, bazasiz muhitda jim yiqiladi).
  void (async () => {
    const { ensureSozlamalarSchema } = await import("@/lib/spisaniya/db");
    await ensureSozlamalarSchema();
  })().catch((err) =>
    console.warn("[instrumentation] bot sxemasi:", err instanceof Error ? err.message : err)
  );

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
        if (job.weekday != null && now.getUTCDay() !== job.weekday) continue; // haftalik ish — faqat o'z kunida
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

  // Mijozlar guruhi boti (alohida token) — bo'lsa, o'z webhook'ini o'rnatadi.
  if (process.env.GROUP_BOT_TOKEN && base) {
    try {
      const { getGroupBot, groupWebhookSecret } = await import("@/lib/tg-group/bot");
      const gbot = getGroupBot();
      const gsecret = groupWebhookSecret();
      if (gbot && gsecret) {
        const gurl = `${base}/api/tg-group`;
        await gbot.telegram.setWebhook(gurl, {
          secret_token: gsecret,
          allowed_updates: ["message", "edited_message", "my_chat_member"],
        });
        console.log(`[instrumentation] Guruh bot webhook'i o'rnatildi: ${gurl}`);
      }
    } catch (err) {
      const { redactForLog } = await import("@/lib/tg-redact");
      console.error("[instrumentation] Guruh bot webhook xatosi:", redactForLog(err));
    }
  }

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
    // redactForLog SHART: bu setWebhook catch'i, telegraf xatosi
    // "request to https://api.telegram.org/bot<TOKEN>/setWebhook failed..." ko'rinishida
    // keladi va har deployda Railway loglariga tokenni yozib qo'yardi.
    const { redactForLog } = await import("@/lib/tg-redact");
    console.error("[instrumentation] Webhook xatosi:", redactForLog(err));
  }
}
