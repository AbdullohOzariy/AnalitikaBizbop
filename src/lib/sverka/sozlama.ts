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
