/**
 * Kunlik "Filiallar narx farqi" hisoboti: bir xil SKU turli filialda turli narxda
 * sotilayotgan holatlar PDF sifatida sozlangan bot orqali guruh topigiga yuboriladi.
 * Manba: analyze/price-quality.getPriceQuality → branchPriceDiffs (eng oxirgi davr).
 *
 * TAKRORLAMASLIK: manba har doim ENG OXIRGI yuklangan davrni qaytaradi. Yangi sotuv
 * fayli yuklanmasa, ertaga ham AYNAN o'sha davr chiqadi — shuning uchun oxirgi
 * yuborilgan periodEnd AppSetting'da saqlanadi va bir xil bo'lsa jim chiqamiz.
 * Belgi FAQAT yuborish muvaffaqiyatli bo'lgach (yoki manba to'liq bo'lib, xabar qiladigan
 * farq topilmagan holatda) yoziladi: aks holda Telegram bir marta yiqilsa, o'sha davr
 * hisoboti butunlay tushib qolardi. Batafsili — `rows.length === 0` shoxidagi izohda.
 */
import { Telegram } from "telegraf";
import { prisma } from "@/lib/prisma";
import { getPriceQuality, type BranchPriceDiff } from "@/lib/analyze/price-quality";
import { formatDateUZ } from "@/lib/format";
import { buildNarxPdf } from "./pdf";
import { redactError, redactForLog } from "@/lib/tg-redact";
import {
  getNarxReportConfig,
  getNarxReportLastPeriod,
  setNarxReportLastPeriod,
} from "./sozlama";

/** Shundan kichik farq "shovqin" (aksiya qoldig'i, yaxlitlash) — hisobotga kirmaydi. */
export const MIN_SPREAD_PCT = 5;

const NF = new Intl.NumberFormat("uz-UZ");

/** Davrda ma'lumoti bor filiallar soni — import to'liqligini o'lchash uchun. */
async function davrFilialSoni(periodEnd: string): Promise<number> {
  const r = await prisma.productSales.findMany({
    where: { periodEnd: new Date(periodEnd) },
    distinct: ["branchId"],
    select: { branchId: true },
  });
  return r.length;
}

/** Shu davrdan OLDINGI eng yaqin davrdagi filiallar soni (taqqoslash bazasi). */
async function oldingiDavrFilialSoni(periodEnd: string): Promise<number> {
  const oldingi = await prisma.productSales.aggregate({
    where: { periodEnd: { lt: new Date(periodEnd) } },
    _max: { periodEnd: true },
  });
  const p = oldingi._max.periodEnd;
  if (!p) return 0; // birinchi davr — taqqoslaydigan narsa yo'q
  const r = await prisma.productSales.findMany({
    where: { periodEnd: p },
    distinct: ["branchId"],
    select: { branchId: true },
  });
  return r.length;
}

export type NarxReportResult =
  | { ok: true; count: number; period: string | null; skipped?: boolean }
  | { ok: false; error: string };

/**
 * Hisobotni sozlangan guruhga (topic) yuboradi.
 * Sozlanmagan (token/chat yo'q) bo'lsa — xato qaytaradi (inv-report bilan bir xil:
 * cron uni ushlab adminga signal beradi, jimgina yo'qolmaydi).
 *
 * @param force — davr tekshiruvini o'tkazib yuboradi (qo'lda "hozir yubor" tugmasi uchun).
 */
export async function sendNarxReport(opts?: { force?: boolean }): Promise<NarxReportResult> {
  try {
    const cfg = await getNarxReportConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    // getPriceQuality unstable_cache (5 daqiqa + ANALYTICS_CACHE_TAG) bilan o'ralgan.
    // Cron uchun MUAMMO EMAS: (1) warm.ts allaqachon shu naqshda keshlangan funksiyalarni
    // server start'da so'rov kontekstisiz chaqiradi — ishlaydi; (2) kuniga bir marta
    // ishlaydigan ish uchun ko'pi bilan 5 daqiqalik eskirish ahamiyatsiz; (3) yangi sotuv
    // fayli yuklanganda tag invalidatsiya bo'ladi, ya'ni odatda kesh sovuq keladi.
    const pq = await getPriceQuality();
    if (!pq.periodEnd) {
      console.log("[narx-report] ma'lumot yo'q (periodEnd null) — o'tkazib yuborildi");
      return { ok: true, count: 0, period: null, skipped: true };
    }

    if (!opts?.force) {
      const last = await getNarxReportLastPeriod();
      if (last === pq.periodEnd) {
        console.log(`[narx-report] ${pq.periodEnd} davri allaqachon yuborilgan — o'tkazib yuborildi`);
        return { ok: true, count: 0, period: pq.periodEnd, skipped: true };
      }
    }

    // Manba (SQL) allaqachon (max−min)/min DESC bo'yicha tartiblangan; himoya uchun
    // qayta tartiblaymiz — LIMIT/ORDER BY kelajakda o'zgarsa PDF jim buzilmasin.
    const rows: BranchPriceDiff[] = pq.branchPriceDiffs
      .filter((r) => r.spreadPct >= MIN_SPREAD_PCT)
      .sort((a, b) => b.spreadPct - a.spreadPct);

    // ── Import to'liqmi? ──────────────────────────────────────────────────────
    // Ro'yxat BO'SH bo'lmagani import tugaganini bildirmaydi: 2+ filial yozilib,
    // qolganlari hali kelmagan oynada ro'yxat to'ladi, lekin min/max CHALA to'plamdan
    // chiqadi. Hisobot yuborilib davr belgilansa — to'liq ma'lumot kelgach to'g'ri
    // hisobot BOSHQA HECH QACHON ketmaydi (jimlik emas, ishonchli tarzda noto'g'ri
    // hisobot + abadiy qulf). Shuning uchun joriy davrdagi filiallar sonini oldingi
    // davr bilan solishtiramiz: kamaygan bo'lsa — import chala, kutamiz.
    const oldingi = await oldingiDavrFilialSoni(pq.periodEnd);
    const joriy = await davrFilialSoni(pq.periodEnd);
    if (oldingi > 0 && joriy < oldingi) {
      console.warn(
        `[narx-report] ${pq.periodEnd}: filiallar chala (${joriy} < ${oldingi}) — ` +
          `import tugamagan bo'lishi mumkin, yuborilmadi va davr belgilanmadi`
      );
      return { ok: true, count: 0, period: pq.periodEnd, skipped: true };
    }

    if (rows.length === 0) {
      // IKKI HOLATNI AJRATAMIZ — ikkovi ham "yubormaymiz", lekin davrni belgilash farq qiladi.
      //
      // (a) Manba ro'yxati BUTUNLAY bo'sh — SHUBHALI, belgilamaymiz. Import quvuri
      //     qatorlarni 500 talik batch'larda TRANZAKSIYASIZ yozadi (admin/upload/actions.ts),
      //     ya'ni birinchi batch commit bo'lishi bilan yangi MAX(periodEnd) ko'rinadi, qolgan
      //     filiallar hali yozilmagan. O'sha oynada manbadagi "bir SKU ≥2 filialda" sharti
      //     hech qayerda bajarilmaydi va ro'yxat bo'sh chiqadi. Agar shu payt davrni
      //     belgilasak, to'liq ma'lumot kelgach ham o'sha kun hisoboti butunlay tushib qolardi.
      //     Belgilamaganimiz uchun ertangi ish (yoki qayta urinish) uni qayta ko'radi.
      //
      // (b) Manbada qatorlar bor, lekin hammasi MIN_SPREAD_PCT dan past — bu HAQIQIY jimlik:
      //     ma'lumot to'liq keldi, shunchaki xabar qiladigan farq yo'q. Belgilaymiz, aks holda
      //     yangi fayl yuklanmaguncha har kuni qaytadan hisoblanardi.
      if (pq.branchPriceDiffs.length === 0) {
        console.warn(
          `[narx-report] ${pq.periodEnd}: manba ro'yxati bo'sh — ma'lumot to'liq yuklanmagan ` +
            `bo'lishi mumkin, davr belgilanmadi (keyingi ishda qayta ko'riladi)`
        );
        return { ok: true, count: 0, period: pq.periodEnd, skipped: true };
      }
      await markPeriodSent(pq.periodEnd);
      console.log(`[narx-report] ${pq.periodEnd}: farq ≥ ${MIN_SPREAD_PCT}% bo'lgan SKU yo'q — yuborilmadi`);
      return { ok: true, count: 0, period: pq.periodEnd, skipped: true };
    }

    // Manbadagi umumiy `pq.truncated` EMAS (u uchala ro'yxat bo'yicha OR) — faqat
    // o'zimiz ishlatadigan ro'yxat bo'yicha. Manba buni slice'dan OLDIN hisoblaydi:
    // downstream'da 500 va "501+" ni farqlab bo'lmaydi (slice signalni yo'q qiladi).
    const truncated = pq.truncatedDiffs;

    const buffer = await buildNarxPdf(rows, {
      periodEnd: pq.periodEnd,
      minSpreadPct: MIN_SPREAD_PCT,
      truncated,
    });

    const top = rows[0];
    const caption =
      `💰 <b>Filiallar narx farqi</b>\n` +
      `🗓 ${formatDateUZ(pq.periodEnd)} · <b>${NF.format(rows.length)}</b> ta SKU narxi filiallarda ` +
      `${MIN_SPREAD_PCT}% dan ko'proq farq qilmoqda\n` +
      `🔺 Eng katta farq: <b>${esc(top.name)}</b> — ${top.spreadPct.toFixed(1)}% ` +
      `(${NF.format(Math.round(top.minPrice))} → ${NF.format(Math.round(top.maxPrice))} so'm)` +
      (truncated ? `\n⚠️ Ro'yxat to'liq emas — manbada cheklangan.` : "");

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};
    await tg.sendDocument(
      cfg.chatId,
      { source: buffer, filename: `narx-farqi-${pq.periodEnd}.pdf` },
      { caption, parse_mode: "HTML", ...thread }
    );

    // FAQAT yuborilgandan keyin — yiqilsa ertaga qayta uriniladi.
    await markPeriodSent(pq.periodEnd);
    return { ok: true, count: rows.length, period: pq.periodEnd };
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Yuborishda xato.";
    console.error("[narx-report] sendNarxReport:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}

/**
 * Davrni "yuborilgan" deb belgilaydi. YIQILSA HAM YUTADI — ataylab.
 *
 * Sabab: bu PDF Telegram'ga ALLAQACHON ketgandan keyin chaqiriladi. Agar baza yozuvi
 * (Neon lahzalik uzilishi) throw qilsa, xato tashqi catch'ga tushib `ok:false` qaytardi →
 * instrumentation throw qiladi → `runCron` 60s dan keyin qayta urinadi → `lastPeriod` hali
 * eski → PDF guruhga IKKINCHI marta ketardi. Belgini yo'qotish (eng yomoni — hisobot bir
 * kun tushib qoladi) dublikat yuborishdan afzal.
 */
async function markPeriodSent(periodEnd: string): Promise<void> {
  try {
    await setNarxReportLastPeriod(periodEnd);
  } catch (err) {
    console.error(
      `[narx-report] ${periodEnd} davrini belgilab bo'lmadi (hisobot YUBORILGAN deb hisoblanadi):`,
      redactForLog(err)
    );
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
