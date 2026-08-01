/**
 * MUDDAT (yaroqlilik) SIGNALI — muddati o'tgan va kritik partiyalar guruh topigiga.
 *
 * Manba: `expiry.expiryRisk()` — Logistika → "Muddat" tabi bilan AYNI hisob, ya'ni
 * xabardagi raqam ekrandagidan farq qilmaydi.
 *
 * NEGA FAQAT "o'tgan" va "kritik": 14 kunlik ogohlantirish (`warn`) kunlik xabarda
 * o'nlab qator bo'lib chiqib, muhimini ko'mib yuborardi — signal o'qilmay qolsa
 * umuman bo'lmagani bilan teng. `warn` ekranda qoladi, xabarga faqat SONI kiradi.
 */
import { Telegram } from "telegraf";
import { expiryRisk, EXPIRY_CRITICAL_DAYS, type ExpiryBatch } from "@/lib/expiry";
import { todayTashkentISO } from "@/lib/date";
import { redactError } from "@/lib/tg-redact";
import { getExpiryAlertConfig } from "./sozlama";

const MAX_LINES = 35; // xabar Telegram chegarasiga urilmasin
const NF = new Intl.NumberFormat("uz-UZ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const md = (s: string) => s.slice(5); // YYYY-MM-DD → MM-DD

function qator(b: ExpiryBatch, i: number): string {
  const kun =
    b.daysUntil < 0
      ? `<b>${-b.daysUntil} kun o'tgan</b>`
      : b.daysUntil === 0
        ? "<b>bugun tugaydi</b>"
        : `<b>${b.daysUntil} kun</b> qoldi`;
  // `atRisk` — muddatgacha SOTILMAY qoladigan miqdor: aynan shu pul yo'qoladi
  const xavf = b.atRisk > 0 ? ` · xavf ${NF.format(Math.round(b.atRisk))} dona` : "";
  return (
    `${i + 1}. <b>${esc(b.name)}</b> (${b.code})\n` +
    `   ${esc(b.location)} · ${NF.format(Math.round(b.qty))} dona · ${md(b.expiryDate)} — ${kun}${xavf}`
  );
}

/**
 * Muddat signalini yuboradi.
 * @param skipIfEmpty — kritik/o'tgan partiya bo'lmasa hech narsa yubormaydi (cron uchun).
 */
export async function sendExpiryAlert(
  opts?: { skipIfEmpty?: boolean }
): Promise<{ ok: true; count: number; skipped?: boolean } | { ok: false; error: string }> {
  try {
    const cfg = await getExpiryAlertConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const hammasi = await expiryRisk();
    const shoshilinch = hammasi.filter((b) => b.status === "expired" || b.status === "critical");
    const ogoh = hammasi.filter((b) => b.status === "warn");

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};
    const sana = todayTashkentISO();

    if (shoshilinch.length === 0) {
      if (opts?.skipIfEmpty) return { ok: true, count: 0, skipped: true };
      const qosh = ogoh.length > 0 ? ` (${ogoh.length} ta partiya 14 kun ichida tugaydi)` : "";
      await tg.sendMessage(
        cfg.chatId,
        `✅ <b>Muddat nazorati</b> · ${sana}\nMuddati o'tgan yoki kritik partiya yo'q.${qosh}`,
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }

    const otgan = shoshilinch.filter((b) => b.status === "expired");
    const kritik = shoshilinch.filter((b) => b.status === "critical");
    // Pul o'lchovi: xavf ostidagi miqdor × dona narxi yo'q, shuning uchun DONA'da
    // beriladi — soxta so'm ko'rsatgandan ko'ra o'lchanadiganini ko'rsatgan ma'qul.
    const xavfDona = shoshilinch.reduce((s, b) => s + Math.max(0, b.atRisk), 0);

    const shown = shoshilinch.slice(0, MAX_LINES);
    const sarlavha =
      `⚠️ <b>Muddat nazorati</b> · ${sana}\n` +
      `Muddati o'tgan: <b>${otgan.length}</b> · kritik (≤${EXPIRY_CRITICAL_DAYS} kun): <b>${kritik.length}</b>` +
      (xavfDona > 0 ? ` · sotilmay qolish xavfi ~${NF.format(Math.round(xavfDona))} dona` : "") +
      (ogoh.length > 0 ? `\n14 kun ichida tugaydigan yana ${ogoh.length} ta partiya bor (Logistika → Muddat).` : "") +
      "\n";
    const tana = shown.map(qator).join("\n");
    const yana =
      shoshilinch.length > shown.length ? `\n\n… va yana ${shoshilinch.length - shown.length} ta partiya.` : "";

    await tg.sendMessage(cfg.chatId, `${sarlavha}\n${tana}${yana}`, { parse_mode: "HTML", ...thread });
    return { ok: true, count: shoshilinch.length };
  } catch (err) {
    // redactForLog SHART emas — redactError allaqachon tokenni tozalaydi (telegraf
    // xatosi matnida `.../bot<TOKEN>/sendMessage` bo'ladi).
    const msg = err instanceof Error ? redactError(err) : "Yuborishda xato.";
    console.error("[expiry-alert] sendExpiryAlert:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
