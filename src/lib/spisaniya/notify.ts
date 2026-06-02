/**
 * Telegram guruhiga xabar yuborish — yangi yozuv va vozvrat holati o'zgarganda.
 * Hammasi fonda (await qilinmasa ham) ishlatilishi mumkin: xato bo'lsa faqat log.
 */
import { getBot } from "./bot";
import { getGroupChatId, filialTopicId, setGuruhMessageId, type YozuvKirim } from "./db";

const TUR_EMOJI: Record<string, string> = {
  spisaniya: "🗑",
  vozvrat: "↩️",
  kafe: "☕",
  ovqatlanish: "🍽",
};
const TUR_UZ: Record<string, string> = {
  spisaniya: "SPISANIYA",
  vozvrat: "QAYTA ISHLASH",
  kafe: "KAFE",
  ovqatlanish: "OVQATLANISH",
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
    `📦 <b>Tovar:</b> ${d.tovar}\n` +
    `📏 <b>Miqdor:</b> ${d.miqdor} ${d.birlik || "dona"}\n` +
    `💰 <b>Summa:</b> ${Number(d.summa).toLocaleString("uz-UZ")} so'm\n`;
  if (d.sabab) matn += `📝 <b>Sabab:</b> ${d.sabab}\n`;
  if (d.firma) matn += `🏢 <b>Firma:</b> ${d.firma}\n`;
  matn +=
    `📍 <b>Filial:</b> ${d.filial}\n` +
    `👤 <b>Xodim:</b> ${d.xodim_ism}${d.xodim_username ? ` (@${d.xodim_username})` : ""}\n` +
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
    console.log(`[guruh] Yozuv #${yozuvId} guruhga yuborildi (message_id=${msg.message_id})`);
  } catch (err) {
    console.error(`[guruh] XATO — yozuv #${yozuvId}:`, err instanceof Error ? err.message : err);
  }
}

const STATUS_EMOJI: Record<string, string> = {
  kutilmoqda: "⏳",
  jarayonda: "🔄",
  bajarildi: "✅",
  rad_etildi: "❌",
};
const STATUS_UZ: Record<string, string> = {
  kutilmoqda: "Kutilmoqda",
  jarayonda: "Jarayonda",
  bajarildi: "Bajarildi",
  rad_etildi: "Rad etildi",
};

/** Vozvrat holati o'zgarganda guruhga xabar. */
export async function vozvratStatusXabar(
  tovar: string,
  firma: string | null,
  status: string,
  yangilaganIsm: string
): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  const chatId = await getGroupChatId();
  if (!chatId) return;
  try {
    await bot.telegram.sendMessage(
      chatId,
      `♻️ Qayta ishlash yangilandi\n` +
        `Tovar: ${tovar}${firma ? ` (${firma})` : ""}\n` +
        `Holat: ${STATUS_EMOJI[status] || ""} ${STATUS_UZ[status] || status}\n` +
        `Yangiladi: ${yangilaganIsm}\n` +
        `Vaqt: ${new Date().toLocaleString("uz-UZ")}`
    );
  } catch (err) {
    console.error("[vozvrat-xabar] xato:", err instanceof Error ? err.message : err);
  }
}
