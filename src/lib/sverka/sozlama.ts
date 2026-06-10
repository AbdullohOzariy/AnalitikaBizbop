/** Sverka sozlamalari — guruh chat ID (asosiy bazadagi AppSetting, 5 daqiqa kesh). */
import { prisma } from "@/lib/prisma";

const KEY = "SVERKA_GROUP_CHAT_ID";
let cache: { val: string | null; at: number } | null = null;

export async function getSverkaGroupChatId(): Promise<string | null> {
  if (process.env.SVERKA_GROUP_CHAT_ID) return process.env.SVERKA_GROUP_CHAT_ID;
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const val = row?.value?.trim() || null;
  cache = { val, at: now };
  return val;
}

export async function setSverkaGroupChatId(chatId: string): Promise<void> {
  const v = chatId.trim();
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: v },
    update: { value: v },
  });
  cache = { val: v || null, at: Date.now() };
}

// ─── Filial topiklari: sklad nomi → guruh topigi (message_thread_id) ──────────
let topicCache: { rows: { name: string; topicId: number }[]; at: number } | null = null;

/** Sklad nomi filialga mos kelsa — o'sha topic; aks holda null (umumiy). */
export async function getSverkaTopicId(sklad: string): Promise<number | null> {
  const now = Date.now();
  if (!topicCache || now - topicCache.at > 5 * 60_000) {
    const rows = await prisma.branch
      .findMany({ where: { sverkaTopicId: { not: null } }, select: { name: true, sverkaTopicId: true } })
      .catch(() => []);
    topicCache = { rows: rows.map((r) => ({ name: r.name, topicId: r.sverkaTopicId! })), at: now };
  }
  const s = sklad.trim().toLowerCase();
  const hit = topicCache.rows.find((r) => r.name.trim().toLowerCase() === s);
  return hit?.topicId ?? null;
}

/** Sozlamalar saqlanganda topik keshini yangilash. */
export function clearSverkaTopicCache(): void {
  topicCache = null;
}
