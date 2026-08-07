/**
 * ZAXIRA NORMASI hisoboti — belgilangan normadan oshib ketgan SKU × filial qatorlari.
 *
 * NORMA MANBAI: `StockdayLimit` (kategoriya/subkategoriya) + `zakaz_max_stockday`
 * (global standart). Ustunlik: subkategoriya → ota kategoriya → global. Bu qoida
 * `lib/zakaz/stockday-limit.ts` dagi `limitFor` da yozilgan va SHU YERDA HAM
 * O'SHA FUNKSIYA ishlatiladi — SQL'da qayta yozilmaydi.
 *
 * FORMULA `/stockday` sahifasi bilan AYNI: `snapshot-reports.ts` dagi `sdCte`
 * eksport qilinib, shu yerda qayta ishlatiladi. Ikki joyda ikki xil stockday
 * chiqishi — eng yomon natija bo'lardi.
 *
 * NEGA `STOCK_NORMAL` (30 kun) EMAS: u `/stockday` sahifasidagi "ortiqcha"
 * ko'rinishining qotirilgan chegarasi. Bu hisobot esa BIZNES QARORI bo'lgan
 * kategoriya normalarini tekshiradi — ikkisi boshqa narsa.
 */
import * as XLSX from "xlsx";
import { Telegram } from "telegraf";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { sdCte, type SnapshotFilters } from "@/lib/snapshot-reports";
import { getStockdayLimits, limitFor } from "@/lib/zakaz/stockday-limit";
import { getDefaultRangeUncached } from "@/lib/analytics";
import { isoDay, todayTashkentISO } from "@/lib/date";
import { formatUZS } from "@/lib/format";
import { redactError } from "@/lib/tg-redact";
import { getStockdayReportConfig } from "./sozlama";

/**
 * Chiqarib tashlangan kodlar uchun SQL sharti.
 *
 * NEGA KERAK: ba'zi qatorlar tovar emas — masalan yetkazib berish xizmati
 * ("DOSTAVKA"), qoldig'i shartli 100 000 qilib qo'yilgan. Ular normadan
 * o'n minglab kun oshib ko'rinadi va ro'yxatning boshini egallab, haqiqiy
 * signalni ko'mib yuboradi.
 *
 * NEGA ARXIV EMAS: bunday qatorlar HAR KUNI sotiladi, arxivlangan SKU esa
 * sotuv yuklanganda avtomatik aktivga qaytariladi — arxiv ularda turmaydi.
 * NEGA "qoldiq > N" EMAS: kartoshka (274 t), tuxum, un ham katta qoldiqli —
 * bunday filtr haqiqiy tovarni ham yashirib qo'yardi.
 */
function skipShart(codes: number[]): Prisma.Sql {
  return codes.length > 0 ? Prisma.sql`AND sd.code <> ALL(${codes}::int[])` : Prisma.empty;
}

/**
 * Excel'ga tushadigan eng ko'p qator. Oshsa — caption'da OCHIQ aytiladi.
 * Jimgina kesish "hammasi shu" degan noto'g'ri taassurot berardi.
 */
export const MAX_ROWS = 5000;

export type NormaQator = {
  branch: string;
  code: number;
  pname: string;
  cname: string | null;
  stockQty: number;
  avgDaily: number;
  stockDays: number;
  norma: number;
  oshgan: number; // kun
  ortiqchaQty: number; // dona
  ortiqchaPul: number; // so'm (muzlagan kapital, normadan ortig'i)
};

/**
 * Kategoriya → amaldagi norma. `limitFor` ustunlik qoidasini har bir kategoriya
 * uchun oldindan hisoblab, SQL'ga tayyor ro'yxat sifatida beramiz.
 *
 * NEGA SHUNDAY: ustunlik mantig'i (sub → ota → global) bitta joyda —
 * `limitFor` da — qolishi kerak. SQL'da COALESCE bilan takrorlansa, ikkalasi
 * vaqt o'tib bir-biridan uzoqlashadi va normalar jimgina noto'g'ri qo'llanadi.
 * Kategoriya soni kichik (~150), shuning uchun bu qimmat emas.
 */
export function normalarniYoy(
  limits: { global: number | null; byCategory: Map<number, number> },
  categories: { id: number; parentId: number | null }[]
): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of categories) {
    const n = limitFor(limits, c.id, c.parentId);
    if (n != null && n > 0) out.set(c.id, n);
  }
  return out;
}

/** Excel qatorlari (sarlavha + ma'lumot). Alohida — test qilinadi. */
export function excelQatorlar(rows: NormaQator[]): (string | number)[][] {
  const header = [
    "Filial", "Kod", "Tovar", "Kategoriya",
    "Norma (kun)", "Zaxira (kun)", "Oshgan (kun)",
    "Qoldiq", "Kunlik o'rtacha", "Ortiqcha dona", "Ortiqcha summa",
  ];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return [
    header,
    ...rows.map((r) => [
      r.branch, r.code, r.pname, r.cname ?? "",
      r.norma, r1(r.stockDays), r1(r.oshgan),
      r1(r.stockQty), r1(r.avgDaily), r1(r.ortiqchaQty), Math.round(r.ortiqchaPul),
    ]),
  ];
}

/**
 * Normadan oshgan qatorlar + Excel buferi.
 * `null` — norma umuman sozlanmagan yoki sotuv ma'lumoti yo'q.
 */
export async function buildStockdayNormReport(): Promise<{
  buffer: Buffer;
  count: number;
  kesilgan: boolean;
  jamiPul: number;
  periodLabel: string;
  fileTag: string;
} | null> {
  const [limits, cfg] = await Promise.all([getStockdayLimits(), getStockdayReportConfig()]);
  if (limits.global == null && limits.byCategory.size === 0) return null;

  const categories = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const normalar = normalarniYoy(limits, categories);
  if (normalar.size === 0) return null;

  // KESHSIZ variant ATAYLAB: bu funksiyani cron chaqiradi, cron esa Next so'rov
  // konteksti tashqarisida ishlaydi va u yerda `unstable_cache` yiqiladi
  // ("Invariant: incrementalCache missing"). Davr `/stockday` bilan bir xil qoladi.
  const range = await getDefaultRangeUncached();
  const startStr = isoDay(range.start);
  const endStr = isoDay(range.end);
  const todayStr = todayTashkentISO();

  const f: SnapshotFilters = { startStr, endStr, q: "" };

  // Norma ro'yxati — SQL'ga VALUES bo'lib kiradi (qoida JS'da hisoblangan).
  const normaValues = Prisma.join(
    [...normalar].map(([cid, days]) => Prisma.sql`(${cid}::int, ${days}::float8)`),
    ", "
  );

  const rows = await prisma.$queryRaw<
    {
      branch: string; code: number; pname: string; cname: string | null;
      stockQty: number; avgDaily: number; stockDays: number; norma: number;
      ortiqchaQty: number; ortiqchaPul: number;
    }[]
  >(Prisma.sql`
    WITH ${sdCte(f, todayStr)},
    norma(cat_id, max_days) AS (VALUES ${normaValues})
    SELECT sd.bname AS branch, sd.code, sd.pname, c.name AS cname,
           sd."stockQty"::float8 AS "stockQty",
           sd.avg_daily::float8 AS "avgDaily",
           sd.stock_days::float8 AS "stockDays",
           n.max_days::float8 AS norma,
           (sd."stockQty" - n.max_days * sd.avg_daily)::float8 AS "ortiqchaQty",
           -- Ortiqcha kapital = normadan ortiq dona × dona tannarxi.
           -- Dona tannarxi = stock_value / stockQty (sdCte allaqachon hisoblagan);
           -- tannarx ma'lum bo'lmasa 0 — pul o'rniga taxmin yozmaymiz.
           (CASE WHEN sd.stock_value IS NOT NULL AND sd."stockQty" > 0
                 THEN (sd."stockQty" - n.max_days * sd.avg_daily) * (sd.stock_value / sd."stockQty")
                 ELSE 0 END)::float8 AS "ortiqchaPul"
    FROM sd
    JOIN norma n ON n.cat_id = sd."categoryId"
    LEFT JOIN "Category" c ON c.id = sd."categoryId"
    WHERE sd.stock_days IS NOT NULL AND sd.stock_days > n.max_days
      ${skipShart(cfg.excludeCodes)}
    ORDER BY "ortiqchaPul" DESC, sd.stock_days DESC
    LIMIT ${MAX_ROWS + 1}
  `);

  const kesilgan = rows.length > MAX_ROWS;
  const kesik = kesilgan ? rows.slice(0, MAX_ROWS) : rows;

  const qatorlar: NormaQator[] = kesik.map((r) => ({
    branch: r.branch,
    code: r.code,
    pname: r.pname,
    cname: r.cname,
    stockQty: r.stockQty,
    avgDaily: r.avgDaily,
    stockDays: r.stockDays,
    norma: r.norma,
    oshgan: r.stockDays - r.norma,
    ortiqchaQty: r.ortiqchaQty,
    ortiqchaPul: r.ortiqchaPul,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(excelQatorlar(qatorlar)),
    "Normadan oshgan"
  );
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return {
    buffer,
    count: qatorlar.length,
    kesilgan,
    jamiPul: qatorlar.reduce((s, r) => s + r.ortiqchaPul, 0),
    periodLabel: startStr === endStr ? startStr : `${startStr} — ${endStr}`,
    fileTag: endStr,
  };
}

/**
 * Hisobotni sozlangan guruhga (topic) yuboradi.
 *
 * Oshgan qator BO'LMASA ham qisqa xabar ketadi: "hisobot kelmadi" bilan
 * "hammasi normada" ni ajratib bo'lmasligi eng chalkash holat bo'lardi.
 */
export async function sendStockdayNormReport(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  try {
    const cfg = await getStockdayReportConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};

    const rep = await buildStockdayNormReport();

    if (!rep) {
      await tg.sendMessage(
        cfg.chatId,
        "ℹ️ <b>Zaxira normasi</b>\nNorma sozlanmagan yoki sotuv ma'lumoti yo'q.",
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }

    if (rep.count === 0) {
      await tg.sendMessage(
        cfg.chatId,
        `✅ <b>Zaxira normasi</b>\n🗓 ${rep.periodLabel}\nNormadan oshgan tovar yo'q.`,
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }

    const caption =
      `📦 <b>Zaxira normasidan oshgan</b> (SKU × filial)\n` +
      `🗓 ${rep.periodLabel} · <b>${rep.count.toLocaleString("uz-UZ")}</b> ta qator\n` +
      `💰 Ortiqcha kapital: <b>${formatUZS(rep.jamiPul)}</b>` +
      (rep.kesilgan ? `\n⚠️ Eng katta ${MAX_ROWS.toLocaleString("uz-UZ")} tasi ko'rsatildi` : "");

    await tg.sendDocument(
      cfg.chatId,
      { source: rep.buffer, filename: `zaxira-norma-${rep.fileTag}.xlsx` },
      { caption, parse_mode: "HTML", ...thread }
    );

    return { ok: true, count: rep.count };
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Yuborishda xato.";
    console.error("[stockday-report] sendStockdayNormReport:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
