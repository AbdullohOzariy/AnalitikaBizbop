import { Telegram } from "telegraf";
import { getZakazPdfConfig } from "./sozlama";
import { buildZakazPdf } from "./pdf";

const NF = new Intl.NumberFormat("uz-UZ");

/**
 * Zakaz nakladnoyini PDF qilib sozlangan Telegram guruh (topic) ga yuboradi.
 * Sozlanmagan (token/chat yo'q) bo'lsa — xato qaytaradi (avto-yuborishda jim o'tkaziladi).
 */
export async function sendZakazPdf(orderId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const cfg = await getZakazPdfConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const pdf = await buildZakazPdf(orderId);
    if (!pdf) return { ok: false, error: "Zakaz topilmadi." };

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};
    const supplier = pdf.agentName ? `${pdf.agentName} (${pdf.supplierName})` : pdf.supplierName;
    const caption =
      `📦 <b>Zakaz qabul qilindi</b> — № ${pdf.orderId}\n` +
      `🏢 ${supplier}\n` +
      `🗓 ${pdf.sana} · <b>${pdf.skuCount}</b> ta SKU · ${NF.format(Math.round(pdf.total))} so'm`;

    await tg.sendDocument(
      cfg.chatId,
      { source: pdf.buffer, filename: pdf.filename },
      { caption, parse_mode: "HTML", ...thread }
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yuborishda xato.";
    console.error("[zakaz-pdf] sendZakazPdf:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
