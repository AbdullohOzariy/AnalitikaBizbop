/**
 * Zaxira normasi hisoboti sozlamalari — alohida bot token + guruh chat id + topic id +
 * avto-yuborish yoqilgan/yo'q. AppSetting (key-value), 5 daqiqa kesh.
 * Env o'zgaruvchilari ustun turadi (autoEnabled bundan mustasno — faqat bazadan).
 *
 * Marja/Narx hisobotlari bilan AYNI naqsh: har hisobot o'z boti va o'z guruhida
 * bo'lsin — bittasining tokeni almashsa qolganlari to'xtab qolmaydi.
 */
import { prisma } from "@/lib/prisma";

const K_TOKEN = "STOCKDAY_BOT_TOKEN";
const K_CHAT = "STOCKDAY_GROUP_CHAT_ID";
const K_TOPIC = "STOCKDAY_TOPIC_ID";
const K_AUTO = "STOCKDAY_AUTO_ENABLED"; // "1" — kunlik avto yoqilgan

export type StockdayReportConfig = {
  token: string | null;
  chatId: string | null;
  topicId: number | null;
  autoEnabled: boolean;
};

let cache: { val: StockdayReportConfig; at: number } | null = null;

export async function getStockdayReportConfig(): Promise<StockdayReportConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_TOKEN, K_CHAT, K_TOPIC, K_AUTO] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));
  const topicRaw = (process.env.STOCKDAY_TOPIC_ID || m.get(K_TOPIC) || "").trim();
  const val: StockdayReportConfig = {
    token: process.env.STOCKDAY_BOT_TOKEN || m.get(K_TOKEN) || null,
    chatId: process.env.STOCKDAY_GROUP_CHAT_ID || m.get(K_CHAT) || null,
    topicId: /^\d+$/.test(topicRaw) ? Number(topicRaw) : null,
    autoEnabled: (m.get(K_AUTO) || "") === "1",
  };
  cache = { val, at: now };
  return val;
}

/** token bo'sh bo'lsa — o'zgartirmaymiz (oldingisi qoladi). qolganlari har doim yoziladi. */
export async function setStockdayReportConfig(input: {
  token?: string;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
}): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (input.token != null && input.token.trim() !== "") await upsert(K_TOKEN, input.token.trim());
  await upsert(K_CHAT, input.chatId.trim());
  await upsert(K_TOPIC, input.topicId.trim());
  await upsert(K_AUTO, input.autoEnabled ? "1" : "0");
  cache = null;
}

export function clearStockdayReportConfigCache(): void {
  cache = null;
}
