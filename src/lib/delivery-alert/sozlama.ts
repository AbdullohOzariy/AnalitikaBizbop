/**
 * Yetkazib berish kechikishi signali sozlamalari — bot token + guruh chat id + topic id +
 * avto-yuborish yoqilgan/yo'q. Asosiy bazadagi AppSetting (key-value), 5 daqiqa kesh.
 * Env o'zgaruvchilari ustun turadi (autoEnabled bundan mustasno — faqat bazadan).
 */
import { prisma } from "@/lib/prisma";

const K_TOKEN = "DELIVERY_BOT_TOKEN";
const K_CHAT = "DELIVERY_GROUP_CHAT_ID";
const K_TOPIC = "DELIVERY_TOPIC_ID";
const K_AUTO = "DELIVERY_AUTO_ENABLED"; // "1" — kunlik avto yoqilgan

export type DeliveryAlertConfig = {
  token: string | null;
  chatId: string | null;
  topicId: number | null;
  autoEnabled: boolean;
};

let cache: { val: DeliveryAlertConfig; at: number } | null = null;

export async function getDeliveryAlertConfig(): Promise<DeliveryAlertConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_TOKEN, K_CHAT, K_TOPIC, K_AUTO] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));
  const topicRaw = (process.env.DELIVERY_TOPIC_ID || m.get(K_TOPIC) || "").trim();
  const val: DeliveryAlertConfig = {
    token: process.env.DELIVERY_BOT_TOKEN || m.get(K_TOKEN) || null,
    chatId: process.env.DELIVERY_GROUP_CHAT_ID || m.get(K_CHAT) || null,
    topicId: /^\d+$/.test(topicRaw) ? Number(topicRaw) : null,
    autoEnabled: (m.get(K_AUTO) || "") === "1",
  };
  cache = { val, at: now };
  return val;
}

/** token bo'sh bo'lsa — o'zgartirmaymiz (oldingisi qoladi). qolganlari har doim yoziladi. */
export async function setDeliveryAlertConfig(input: {
  token?: string; chatId: string; topicId: string; autoEnabled: boolean;
}): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (input.token != null && input.token.trim() !== "") await upsert(K_TOKEN, input.token.trim());
  await upsert(K_CHAT, input.chatId.trim());
  await upsert(K_TOPIC, input.topicId.trim());
  await upsert(K_AUTO, input.autoEnabled ? "1" : "0");
  cache = null;
}

export function clearDeliveryAlertCache(): void {
  cache = null;
}
