/**
 * Kunlik inventarizatsiya hisoboti: qoldig'i 0/minus LEKIN sotuvi bor muammoli
 * tovarlar (SKU × filial) Excel'i — sozlangan bot orqali guruh topigiga yuboriladi.
 * Manba so'rov: snapshot-reports.inventoryProblemRows (so'nggi snapshot).
 */
import * as XLSX from "xlsx";
import { decimalToNumber } from "@/lib/format";
import { Telegram } from "telegraf";
import { prisma } from "@/lib/prisma";
import { inventoryProblemRows } from "@/lib/snapshot-reports";
import { isoDay } from "@/lib/date";
import { getInventoryReportConfig } from "./sozlama";
import { redactError } from "@/lib/tg-redact";


/** Muammoli tovarlar Excel buferi (so'nggi mavjud kun ma'lumotlari bo'yicha). */
export async function buildInventoryReport(): Promise<{ buffer: Buffer; count: number; dateStr: string }> {
  // FAQAT so'nggi mavjud kun (max periodEnd) snapshot'iga tayanamiz. Ilgari "kecha"gacha
  // 40 kunlik oyna olinar va `latest` CTE har mahsulotning O'Z so'nggi snapshot'ini tanlardi —
  // natijada eskiroq kunda muammoli, lekin so'nggi kunda yechilgan/faylда yo'q tovarlar ham
  // ro'yxatga tushardi (aralash sanalar). Kunlik snapshot: periodStart == periodEnd, shuning
  // uchun startStr=endStr=so'nggi kun aynan o'sha kun qatorlarini beradi.
  const last = await prisma.productSales.aggregate({ _max: { periodEnd: true } }).catch(() => null);
  const day = last?._max.periodEnd;
  const dateStr = day ? isoDay(day) : isoDay(new Date());
  const rows = day
    ? await inventoryProblemRows({ startStr: dateStr, endStr: dateStr, q: "", scopeSubIds: null })
    : [];

  const header = ["Kod", "Mahsulot", "Kategoriya", "Filial", "Qoldiq", "Sotuv"];
  const data = rows.map((r) => [
    r.code, r.pname, r.cname ?? "", r.bname,
    r.stockQty != null ? decimalToNumber(r.stockQty) : "",
    r.soldQty != null ? decimalToNumber(r.soldQty) : "",
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), "Muammoli");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, count: rows.length, dateStr };
}

/**
 * Hisobotni sozlangan guruhga (topic) yuboradi. Muammoli tovar bo'lmasa — qisqa matn.
 * Sozlanmagan (token/chat yo'q) bo'lsa — xato qaytaradi (cron jim o'tkazadi).
 */
export async function sendInventoryReport(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const cfg = await getInventoryReportConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const { buffer, count, dateStr } = await buildInventoryReport();
    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};

    if (count === 0) {
      await tg.sendMessage(
        cfg.chatId,
        `✅ <b>Inventarizatsiya</b> · ${dateStr}\nQoldig'i 0/minus, lekin sotuvi bor muammoli tovar topilmadi.`,
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }

    const caption =
      `📦 <b>Muammoli tovarlar</b> — qoldiq 0/minus, sotuvi bor\n` +
      `🗓 ${dateStr} · <b>${count}</b> ta SKU×filial`;
    await tg.sendDocument(
      cfg.chatId,
      { source: buffer, filename: `inventarizatsiya-${dateStr}.xlsx` },
      { caption, parse_mode: "HTML", ...thread }
    );
    return { ok: true, count };
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Yuborishda xato.";
    console.error("[inv-report] sendInventoryReport:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
