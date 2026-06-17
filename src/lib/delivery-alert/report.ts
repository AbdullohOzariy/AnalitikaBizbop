/**
 * Yetkazib berish kechikishi signali — kutilgan sanadan o'tib ketgan (hali kelmagan)
 * zakazlar ro'yxati sozlangan guruh topigiga matn sifatida yuboriladi.
 * Manba: delivery.lateDeliveries (PurchaseOrder SENT/ACCEPTED + reja lead).
 */
import { Telegram } from "telegraf";
import { lateDeliveries, type ExpectedDelivery } from "@/lib/delivery";
import { getDeliveryAlertConfig } from "./sozlama";

const MAX_LINES = 40; // xabar juda uzun bo'lmasin
const NF = new Intl.NumberFormat("uz-UZ");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function md(s: string): string { return s.slice(5); } // YYYY-MM-DD → MM-DD

function line(d: ExpectedDelivery, i: number): string {
  const who = d.agent ? `${esc(d.supplier)} · ${esc(d.agent)}` : esc(d.supplier);
  return (
    `${i + 1}. <b>${who}</b> — #${d.orderId}\n` +
    `   Yuborildi ${md(d.sentDate)} · kutilgan ${d.expectedDate ? md(d.expectedDate) : "—"} · ` +
    `<b>${d.daysLate} kun</b> kechikdi · ${d.itemCount} SKU`
  );
}

/**
 * Kechikkan yetkazishlar signalini yuboradi.
 * @param skipIfEmpty — true bo'lsa kechikkan zakaz yo'qligida hech narsa yubormaydi (cron uchun).
 */
export async function sendDeliveryAlert(
  opts?: { skipIfEmpty?: boolean }
): Promise<{ ok: true; count: number; skipped?: boolean } | { ok: false; error: string }> {
  try {
    const cfg = await getDeliveryAlertConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const late = await lateDeliveries();
    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};
    const dateStr = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

    if (late.length === 0) {
      if (opts?.skipIfEmpty) return { ok: true, count: 0, skipped: true };
      await tg.sendMessage(
        cfg.chatId,
        `✅ <b>Yetkazib berish</b> · ${dateStr}\nKutilgan sanadan kechikkan zakaz yo'q.`,
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }

    const totalQty = late.reduce((s, d) => s + d.totalQty, 0);
    const shown = late.slice(0, MAX_LINES);
    const header =
      `⏰ <b>Yetkazib berish kechikishi</b> · ${dateStr}\n` +
      `<b>${late.length}</b> ta zakaz kutilgan sanadan o'tib ketdi (hali kelmadi) · jami ${NF.format(Math.round(totalQty))} dona\n`;
    const body = shown.map(line).join("\n");
    const more = late.length > shown.length ? `\n\n… va yana ${late.length - shown.length} ta.` : "";

    await tg.sendMessage(cfg.chatId, `${header}\n${body}${more}`, { parse_mode: "HTML", ...thread });
    return { ok: true, count: late.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yuborishda xato.";
    console.error("[delivery-alert] sendDeliveryAlert:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
