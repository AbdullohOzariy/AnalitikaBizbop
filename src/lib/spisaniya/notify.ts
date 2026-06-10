/**
 * Telegram guruhiga xabar yuborish — yangi yozuv va vozvrat holati o'zgarganda.
 * Hammasi fonda (await qilinmasa ham) ishlatilishi mumkin: xato bo'lsa faqat log.
 */
import { getBot } from "./bot";
import {
  getGroupChatId,
  filialTopicId,
  setGuruhMessageId,
  vozvratSetGuruhMessageId,
  VOZVRAT_HOLAT_LABEL,
  VOZVRAT_YONALISH_LABEL,
  type YozuvKirim,
  type VozvratKirim,
  type VozvratYozuv,
} from "./db";

/** parse_mode:"HTML" uchun foydalanuvchi matnini eskeyplash — aks holda tovar/sabab
 * ichidagi `<`/`&` xabar formatini buzadi yoki soxta teg kiritishga yo'l ochadi. */
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TUR_EMOJI: Record<string, string> = {
  spisaniya: "🗑",
  vozvrat: "↩️",
  kafe: "☕",
  ovqatlanish: "🍽",
  ichki_sotuv: "🏷",
};
const TUR_UZ: Record<string, string> = {
  spisaniya: "SPISANIYA",
  vozvrat: "QAYTA ISHLASH",
  kafe: "KAFE",
  ovqatlanish: "OVQATLANISH",
  ichki_sotuv: "ICHKI SOTUV",
};

/** Yangi yozuvni guruhga (filial topic'iga) yuboradi va message_id'ni saqlaydi. */
export async function guruhgaYuborish(d: YozuvKirim, yozuvId: number): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  const chatId = await getGroupChatId();
  if (!chatId) {
    console.error("[guruh] GROUP_CHAT_ID topilmadi!");
    return;
  }

  const threadId = await filialTopicId(d.filial);
  const vaqt = new Date().toLocaleString("uz-UZ");

  let matn =
    `${TUR_EMOJI[d.tur] || "📦"} <b>${TUR_UZ[d.tur] || d.tur.toUpperCase()}</b>\n\n` +
    `📦 <b>Tovar:</b> ${esc(d.tovar)}\n` +
    `📏 <b>Miqdor:</b> ${d.miqdor} ${esc(d.birlik || "dona")}\n` +
    `💰 <b>Summa:</b> ${Number(d.summa).toLocaleString("uz-UZ")} so'm\n`;
  if (d.sabab) matn += `📝 <b>Sabab:</b> ${esc(d.sabab)}\n`;
  if (d.firma) matn += `🏢 <b>Firma:</b> ${esc(d.firma)}\n`;
  matn +=
    `📍 <b>Filial:</b> ${esc(d.filial)}\n` +
    `👤 <b>Xodim:</b> ${esc(d.xodim_ism)}${d.xodim_username ? ` (@${esc(d.xodim_username)})` : ""}\n` +
    `🕐 <b>Vaqt:</b> ${vaqt}`;

  const opts = {
    parse_mode: "HTML" as const,
    ...(threadId ? { message_thread_id: threadId } : {}),
  };

  try {
    const msg = d.rasm_file_id
      ? await bot.telegram.sendPhoto(chatId, d.rasm_file_id, { caption: matn, ...opts })
      : await bot.telegram.sendMessage(chatId, matn, opts);
    await setGuruhMessageId(yozuvId, msg.message_id);
    // QR kod rasmi (ixtiyoriy) — asosiy xabarga javob sifatida, o'sha topikda
    if (d.qr_file_id) {
      await bot.telegram
        .sendPhoto(chatId, d.qr_file_id, {
          caption: `📷 QR kod — ${esc(d.tovar)} (yozuv #${yozuvId})`,
          parse_mode: "HTML",
          reply_parameters: { message_id: msg.message_id },
          ...(threadId ? { message_thread_id: threadId } : {}),
        })
        .catch((e) => console.error(`[guruh] QR rasm xato #${yozuvId}:`, e instanceof Error ? e.message : e));
    }
    console.log(`[guruh] Yozuv #${yozuvId} guruhga yuborildi (message_id=${msg.message_id})`);
  } catch (err) {
    console.error(`[guruh] XATO — yozuv #${yozuvId}:`, err instanceof Error ? err.message : err);
  }
}


// ─── Yangi Vozvrat jarayoni xabarlari ─────────────────────────────────────────

const VOZVRAT_HOLAT_EMOJI: Record<string, string> = {
  xabar_berildi: "📣",
  saqlash_xonasida: "🏬",
  yuborildi: "📤",
  qaytarildi: "✅",
  qaytarilmadi: "⚠️",
};

/** Yangi vozvrat yaratilganda guruhga (filial topigiga) yuboradi. */
export async function vozvratGuruhgaYuborish(v: VozvratKirim, vozvratId: number): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  const chatId = await getGroupChatId();
  if (!chatId) return;

  const threadId = await filialTopicId(v.filial);
  const holat = v.status || "xabar_berildi";

  let matn =
    `🔁 <b>VOZVRAT</b>\n\n` +
    `📦 <b>Tovar:</b> ${esc(v.tovar)}\n` +
    `📏 <b>Miqdor:</b> ${v.miqdor} ${esc(v.birlik || "dona")}\n` +
    `💰 <b>Summa:</b> ${Number(v.summa).toLocaleString("uz-UZ")} so'm\n`;
  if (v.sabab) matn += `📝 <b>Sabab:</b> ${esc(v.sabab)}\n`;
  matn += `➡️ <b>Yo'nalish:</b> ${VOZVRAT_YONALISH_LABEL[v.yonalish] || esc(v.yonalish)}`;
  if (v.yonalish === "taminotchi" && v.taminotchi) matn += ` (${esc(v.taminotchi)})`;
  matn += `\n`;
  matn += `📊 <b>Holat:</b> ${VOZVRAT_HOLAT_EMOJI[holat] || ""} ${VOZVRAT_HOLAT_LABEL[holat] || esc(holat)}\n`;
  if (holat === "qaytarilmadi" && v.qaytarilmadi_sabab)
    matn += `❗ <b>Qaytarilmadi sababi:</b> ${esc(v.qaytarilmadi_sabab)}\n`;
  matn +=
    `📍 <b>Filial:</b> ${esc(v.filial)}\n` +
    `👤 <b>Xodim:</b> ${esc(v.xodim_ism)}${v.xodim_username ? ` (@${esc(v.xodim_username)})` : ""}\n` +
    `🕐 <b>Vaqt:</b> ${new Date().toLocaleString("uz-UZ")}`;

  const opts = { parse_mode: "HTML" as const, ...(threadId ? { message_thread_id: threadId } : {}) };
  try {
    const msg = v.rasm_file_id
      ? await bot.telegram.sendPhoto(chatId, v.rasm_file_id, { caption: matn, ...opts })
      : await bot.telegram.sendMessage(chatId, matn, opts);
    await vozvratSetGuruhMessageId(vozvratId, msg.message_id);
  } catch (err) {
    console.error(`[vozvrat-guruh] #${vozvratId}:`, err instanceof Error ? err.message : err);
  }
}

/** Vozvrat holati o'zgarganda / chiqimga o'tkazilganda guruhga xabar (filial topigiga). */
export async function vozvratHolatGuruhXabar(
  v: VozvratYozuv,
  yangilaganIsm: string,
  qoshimcha?: string
): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  const chatId = await getGroupChatId();
  if (!chatId) return;
  const threadId = await filialTopicId(v.filial);
  const opts = { parse_mode: "HTML" as const, ...(threadId ? { message_thread_id: threadId } : {}) };
  let matn =
    `🔁 <b>Vozvrat yangilandi</b>\n` +
    `📦 ${esc(v.tovar)} — ${Number(v.summa).toLocaleString("uz-UZ")} so'm\n` +
    `📊 Holat: ${VOZVRAT_HOLAT_EMOJI[v.status] || ""} ${VOZVRAT_HOLAT_LABEL[v.status] || esc(v.status)}\n`;
  if (qoshimcha) matn += `${esc(qoshimcha)}\n`;
  matn += `👤 ${esc(yangilaganIsm)} · ${new Date().toLocaleString("uz-UZ")}`;
  try {
    await bot.telegram.sendMessage(chatId, matn, opts);
  } catch (err) {
    console.error("[vozvrat-holat-xabar]:", err instanceof Error ? err.message : err);
  }
}

