/**
 * Filiallar narx farqi hisoboti sozlamalari — alohida bot token + guruh chat id + topic id +
 * avto-yuborish yoqilgan/yo'q. Asosiy bazadagi AppSetting (key-value), 5 daqiqa kesh.
 * Env o'zgaruvchilari ustun turadi (autoEnabled bundan mustasno — faqat bazadan).
 */
import { prisma } from "@/lib/prisma";

const K_TOKEN = "NARX_REPORT_BOT_TOKEN";
const K_CHAT = "NARX_REPORT_GROUP_CHAT_ID";
const K_TOPIC = "NARX_REPORT_TOPIC_ID";
const K_AUTO = "NARX_REPORT_AUTO"; // "1" — kunlik avto yoqilgan
const K_LAST = "NARX_REPORT_LAST_PERIOD"; // oxirgi MUVAFFAQIYATLI yuborilgan davr (ISO sana)

export type NarxReportConfig = {
  token: string | null;
  chatId: string | null;
  topicId: number | null;
  autoEnabled: boolean;
};

let cache: { val: NarxReportConfig; at: number } | null = null;

export async function getNarxReportConfig(): Promise<NarxReportConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_TOKEN, K_CHAT, K_TOPIC, K_AUTO] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));
  const topicRaw = (process.env.NARX_REPORT_TOPIC_ID || m.get(K_TOPIC) || "").trim();
  const val: NarxReportConfig = {
    token: process.env.NARX_REPORT_BOT_TOKEN || m.get(K_TOKEN) || null,
    chatId: process.env.NARX_REPORT_GROUP_CHAT_ID || m.get(K_CHAT) || null,
    topicId: /^\d+$/.test(topicRaw) ? Number(topicRaw) : null,
    autoEnabled: (m.get(K_AUTO) || "") === "1",
  };
  cache = { val, at: now };
  return val;
}

/**
 * token bo'sh bo'lsa — o'zgartirmaymiz (oldingisi qoladi). qolganlari har doim yoziladi.
 *
 * TOKEN ALOHIDA: Prisma xatosi (masalan `PrismaClientValidationError`) argumentlarni xabar
 * matniga qo'shadi — token upsert'i yiqilsa xato matnida TOKENNING O'ZI bo'ladi. Shuning
 * uchun uni alohida try/catch ichida bajarib, tashqariga umumiy xato chiqaramiz.
 */
export async function setNarxReportConfig(input: {
  token?: string; chatId: string; topicId: string; autoEnabled: boolean;
}): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (input.token != null && input.token.trim() !== "") {
    try {
      await upsert(K_TOKEN, input.token.trim());
    } catch {
      // Xato obyekti ATAYLAB yutiladi: uning message'ida token bo'lishi mumkin.
      throw new Error("Bot tokenni saqlab bo'lmadi (bazaga yozishda xato).");
    }
  }
  await upsert(K_CHAT, input.chatId.trim());
  await upsert(K_TOPIC, input.topicId.trim());
  await upsert(K_AUTO, input.autoEnabled ? "1" : "0");
  cache = null;
}

/**
 * Oxirgi yuborilgan davr — ATAYLAB KESHLANMAYDI. Bu cron HOLATI, sozlama emas:
 * 5 daqiqalik eskirgan qiymat "yuborilmagan" deb qaror qildirib, bir davrni ikki
 * marta yuborishi mumkin edi. Har chaqiruvda bazadan o'qiymiz (kuniga bir marta).
 */
export async function getNarxReportLastPeriod(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: K_LAST } }).catch(() => null);
  return row?.value?.trim() || null;
}

/** Faqat yuborish MUVAFFAQIYATLI bo'lgandan keyin chaqiriladi. */
export async function setNarxReportLastPeriod(periodEnd: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: K_LAST },
    create: { key: K_LAST, value: periodEnd },
    update: { value: periodEnd },
  });
}
