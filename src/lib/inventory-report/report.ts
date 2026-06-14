/**
 * Kunlik inventarizatsiya hisoboti: qoldig'i 0/minus LEKIN sotuvi bor muammoli
 * tovarlar (SKU × filial) Excel'i — sozlangan bot orqali guruh topigiga yuboriladi.
 * Manba so'rov: snapshot-reports.inventoryProblemRows (so'nggi snapshot).
 */
import * as XLSX from "xlsx";
import { Telegram } from "telegraf";
import { prisma } from "@/lib/prisma";
import { inventoryProblemRows } from "@/lib/snapshot-reports";
import { getInventoryReportConfig } from "./sozlama";

function num(n: unknown): number {
  const v = typeof n === "object" && n !== null && "toNumber" in n ? (n as { toNumber(): number }).toNumber() : Number(n);
  return isNaN(v) ? 0 : v;
}

/** Muammoli tovarlar Excel buferi (so'nggi mavjud kun ma'lumotlari bo'yicha). */
export async function buildInventoryReport(): Promise<{ buffer: Buffer; count: number; dateStr: string }> {
  // Bir kun oldingi (kecha) holatiga ko'ra — Toshkent (UTC+5, DST yo'q).
  // 14:00/14-sanada → 13-sana ma'lumoti. endStr = kecha; oyna kechagacha 40 kun
  // (dam olish/bayram tufayli kun o'tkazib yuborilsa ham eng so'nggi snapshot topiladi).
  const TASH = 5 * 3_600_000;
  const yEnd = Date.now() + TASH - 24 * 3_600_000;
  const endStr = new Date(yEnd).toISOString().slice(0, 10);
  const startStr = new Date(yEnd - 40 * 24 * 3_600_000).toISOString().slice(0, 10);
  const rows = await inventoryProblemRows({ startStr, endStr, q: "", scopeSubIds: null });
  // Yorliq uchun haqiqiy ishlatilgan ma'lumot kuni (kechagacha bo'lgan eng so'nggi periodEnd)
  const lastPs = await prisma.productSales
    .aggregate({ _max: { periodEnd: true }, where: { periodEnd: { lte: new Date(endStr + "T00:00:00.000Z") } } })
    .catch(() => null);
  const dateStr = lastPs?._max.periodEnd ? lastPs._max.periodEnd.toISOString().slice(0, 10) : endStr;

  const header = ["Kod", "Mahsulot", "Kategoriya", "Filial", "Qoldiq", "Sotuv"];
  const data = rows.map((r) => [
    r.code, r.pname, r.cname ?? "", r.bname,
    r.stockQty != null ? num(r.stockQty) : "",
    r.soldQty != null ? num(r.soldQty) : "",
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
    const msg = err instanceof Error ? err.message : "Yuborishda xato.";
    console.error("[inv-report] sendInventoryReport:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
