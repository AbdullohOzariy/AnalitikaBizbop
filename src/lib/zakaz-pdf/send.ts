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

    // Filialli variant — agar zakazda filial taqsimoti bo'lsa undagi withBranch=true bo'ladi.
    const branchPdf = await buildZakazPdf(orderId, "withBranch");
    if (!branchPdf) return { ok: false, error: "Zakaz topilmadi." };
    const totalPdf = await buildZakazPdf(orderId, "total");
    if (!totalPdf) return { ok: false, error: "Zakaz topilmadi." };

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};
    const supplier = totalPdf.agentName ? `${totalPdf.agentName} (${totalPdf.supplierName})` : totalPdf.supplierName;
    const head =
      `📦 <b>Zakaz qabul qilindi</b> — № ${totalPdf.orderId}\n` +
      `🏢 ${supplier}\n` +
      `🗓 ${totalPdf.sana} · <b>${totalPdf.skuCount}</b> ta SKU · ${NF.format(Math.round(totalPdf.total))} so'm`;

    // Filial taqsimoti bo'lsa — IKKI nakladnoy (filial bo'yicha + jami); aks holda faqat jami.
    if (branchPdf.withBranch) {
      await tg.sendDocument(
        cfg.chatId,
        { source: branchPdf.buffer, filename: branchPdf.filename },
        { caption: `${head}\n📊 Filiallar bo'yicha`, parse_mode: "HTML", ...thread }
      );
      await tg.sendDocument(
        cfg.chatId,
        { source: totalPdf.buffer, filename: totalPdf.filename },
        { caption: `🧾 Jami nakladnoy — № ${totalPdf.orderId}`, parse_mode: "HTML", ...thread }
      );
    } else {
      await tg.sendDocument(
        cfg.chatId,
        { source: totalPdf.buffer, filename: totalPdf.filename },
        { caption: head, parse_mode: "HTML", ...thread }
      );
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yuborishda xato.";
    console.error("[zakaz-pdf] sendZakazPdf:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
