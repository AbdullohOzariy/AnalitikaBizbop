/**
 * Logistika sozlamalari — reys xabarlari boradigan guruh (va ixtiyoriy topik).
 *
 * MUHIM: bu spisaniya (bizbop) guruhidan MUTLAQO ALOHIDA. Reyslar kuniga o'nlab
 * xabar/tahrir beradi — spisaniya topiklariga aralashtirilsa ikkalasi ham o'qilmaydi.
 * Shu sababli o'z kalitlari: LOGISTIKA_GROUP_CHAT_ID / LOGISTIKA_TOPIC_ID.
 *
 * Manba tartibi: env > AppSetting (5 daqiqa kesh).
 */
import { prisma } from "@/lib/prisma";

const CHAT_KEY = "LOGISTIKA_GROUP_CHAT_ID";
const TOPIC_KEY = "LOGISTIKA_TOPIC_ID";
const TTL_MS = 5 * 60_000;

export type LogistikaGroup = { chatId: string | null; topicId: number | null };

let cache: { val: LogistikaGroup; at: number } | null = null;

/** "123" -> 123; bo'sh/noto'g'ri -> null (0 ham topic emas). */
function topicRaqam(s: string | null | undefined): number | null {
  const n = Number((s ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Logistika guruhi: chat ID va (bo'lsa) topik. DB o'qib bo'lmasa ham throw qilmaydi. */
export async function getLogistikaGroup(): Promise<LogistikaGroup> {
  const envChat = process.env.LOGISTIKA_GROUP_CHAT_ID?.trim() || null;
  const envTopic = topicRaqam(process.env.LOGISTIKA_TOPIC_ID);
  // env chat ID berilgan bo'lsa — DB'ga umuman bormaymiz (deploy sozlamasi ustun).
  if (envChat) return { chatId: envChat, topicId: envTopic };

  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.val;

  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [CHAT_KEY, TOPIC_KEY] } }, select: { key: true, value: true } })
    .catch(() => [] as { key: string; value: string }[]);

  const val: LogistikaGroup = {
    chatId: rows.find((r) => r.key === CHAT_KEY)?.value?.trim() || null,
    topicId: envTopic ?? topicRaqam(rows.find((r) => r.key === TOPIC_KEY)?.value),
  };
  cache = { val, at: now };
  return val;
}

/** Sozlamalar sahifasidan saqlash — keshni darhol yangilaydi. */
export async function setLogistikaGroup(chatId: string, topicId?: number | null): Promise<void> {
  const chat = chatId.trim();
  await prisma.appSetting.upsert({
    where: { key: CHAT_KEY },
    create: { key: CHAT_KEY, value: chat },
    update: { value: chat },
  });
  const topic = topicId != null && topicId > 0 ? String(Math.trunc(topicId)) : "";
  await prisma.appSetting.upsert({
    where: { key: TOPIC_KEY },
    create: { key: TOPIC_KEY, value: topic },
    update: { value: topic },
  });
  cache = { val: { chatId: chat || null, topicId: topicRaqam(topic) }, at: Date.now() };
}

/** Keshni majburan bo'shatish (test/sozlama o'zgarganda). */
export function clearLogistikaGroupCache(): void {
  cache = null;
}
