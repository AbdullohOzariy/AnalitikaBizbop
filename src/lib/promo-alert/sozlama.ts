/**
 * Aksiya (promo) signali sozlamalari — `delivery-alert`/`expiry-alert` naqshi bilan
 * AYNI: bot token + guruh chat id + topic id + avto-yuborish. AppSetting, 5 daqiqa
 * kesh, env ustun (`autoEnabled` bundan mustasno — faqat bazadan, aks holda deploy
 * env'i operator qarorini bosib ketardi).
 */
import { prisma } from "@/lib/prisma";

const K_TOKEN = "PROMO_BOT_TOKEN";
const K_CHAT = "PROMO_GROUP_CHAT_ID";
const K_TOPIC = "PROMO_TOPIC_ID";
const K_AUTO = "PROMO_AUTO_ENABLED"; // "1" — kunlik avto yoqilgan

export type PromoAlertConfig = {
  token: string | null;
  chatId: string | null;
  topicId: number | null;
  autoEnabled: boolean;
};

let cache: { val: PromoAlertConfig; at: number } | null = null;

export async function getPromoAlertConfig(): Promise<PromoAlertConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_TOKEN, K_CHAT, K_TOPIC, K_AUTO] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));
  const topicRaw = (process.env.PROMO_TOPIC_ID || m.get(K_TOPIC) || "").trim();
  const val: PromoAlertConfig = {
    token: process.env.PROMO_BOT_TOKEN || m.get(K_TOKEN) || null,
    chatId: process.env.PROMO_GROUP_CHAT_ID || m.get(K_CHAT) || null,
    topicId: /^\d+$/.test(topicRaw) ? Number(topicRaw) : null,
    autoEnabled: (m.get(K_AUTO) || "") === "1",
  };
  cache = { val, at: now };
  return val;
}

/** token bo'sh bo'lsa — o'zgartirilmaydi (oldingisi qoladi). Qolganlari har doim yoziladi. */
export async function setPromoAlertConfig(input: {
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
