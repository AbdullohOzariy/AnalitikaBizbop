/**
 * Inventarizatsiya xabarnomasi sozlamalari — alohida bot token + guruh chat id + topic id.
 * Asosiy bazadagi AppSetting (key-value), 5 daqiqa kesh. Env o'zgaruvchilari ustun turadi.
 */
import { prisma } from "@/lib/prisma";

const K_TOKEN = "INVENTORY_BOT_TOKEN";
const K_CHAT = "INVENTORY_GROUP_CHAT_ID";
const K_TOPIC = "INVENTORY_TOPIC_ID";

export type InventoryReportConfig = { token: string | null; chatId: string | null; topicId: number | null };

let cache: { val: InventoryReportConfig; at: number } | null = null;

export async function getInventoryReportConfig(): Promise<InventoryReportConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_TOKEN, K_CHAT, K_TOPIC] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));
  const topicRaw = (process.env.INVENTORY_TOPIC_ID || m.get(K_TOPIC) || "").trim();
  const val: InventoryReportConfig = {
    token: process.env.INVENTORY_BOT_TOKEN || m.get(K_TOKEN) || null,
    chatId: process.env.INVENTORY_GROUP_CHAT_ID || m.get(K_CHAT) || null,
    topicId: /^\d+$/.test(topicRaw) ? Number(topicRaw) : null,
  };
  cache = { val, at: now };
  return val;
}

/** token bo'sh bo'lsa — o'zgartirmaymiz (oldingisi qoladi). chatId/topicId har doim yoziladi. */
export async function setInventoryReportConfig(input: {
  token?: string; chatId: string; topicId: string;
}): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (input.token != null && input.token.trim() !== "") await upsert(K_TOKEN, input.token.trim());
  await upsert(K_CHAT, input.chatId.trim());
  await upsert(K_TOPIC, input.topicId.trim());
  cache = null;
}

