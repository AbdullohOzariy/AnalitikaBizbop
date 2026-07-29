/**
 * Community (mijozlar guruhi) AI tahlili sozlamalari — AppSetting (key-value), 5 daqiqa kesh.
 * Env ustun turadi (`autoEnabled` bundan mustasno — faqat bazadan, boshqa hisobot
 * modullaridagi kabi: sozlanmagan muhitda cron har kuni alert yubormasin).
 *
 * OPERATOR ID'LARI eng muhim sozlama: operator oddiy foydalanuvchi hisobidan yozadi
 * (`fromBot=false`), ya'ni uni avtomatik aniqlab BO'LMAYDI. Noto'g'ri bo'lsa butun
 * "javob berildimi" mantig'i quladi.
 */
import { prisma } from "@/lib/prisma";

const K_KEY = "COMMUNITY_AI_KEY";
const K_MODEL = "COMMUNITY_AI_MODEL";
const K_AUTO = "COMMUNITY_AI_AUTO"; // "1" — kunlik cron yoqilgan
const K_OPS = "COMMUNITY_OPERATOR_IDS"; // vergul bilan: "7078135077,123456"
const K_OPN = "COMMUNITY_OPERATOR_NAMES"; // HTML eksport uchun (unda fromId yo'q): "bizbop"
const K_CHAT = "COMMUNITY_CHAT_ID"; // qaysi guruh tahlil qilinadi (bo'sh = birinchi faol)

export interface CommunityConfig {
  apiKey: string | null;
  model: string | null;
  autoEnabled: boolean;
  operatorIds: bigint[];
  /** Kichik harfda — HTML eksportdan kelgan xabarlar uchun (fromId null). */
  operatorNames: string[];
  chatId: bigint | null;
}

let cache: { val: CommunityConfig; at: number } | null = null;

function bigintlar(raw: string): bigint[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s))
    .map((s) => BigInt(s));
}

export async function getCommunityConfig(): Promise<CommunityConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;

  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_KEY, K_MODEL, K_AUTO, K_OPS, K_OPN, K_CHAT] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));

  const chatRaw = (process.env.COMMUNITY_CHAT_ID || m.get(K_CHAT) || "").trim();
  const val: CommunityConfig = {
    apiKey: process.env.GEMINI_API_KEY || m.get(K_KEY) || null,
    model: process.env.GEMINI_MODEL_SMART || m.get(K_MODEL) || null,
    autoEnabled: (m.get(K_AUTO) || "") === "1",
    operatorIds: bigintlar(process.env.COMMUNITY_OPERATOR_IDS || m.get(K_OPS) || ""),
    operatorNames: (process.env.COMMUNITY_OPERATOR_NAMES || m.get(K_OPN) || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    chatId: /^-?\d+$/.test(chatRaw) ? BigInt(chatRaw) : null,
  };
  cache = { val, at: now };
  return val;
}

/** API kaliti bo'sh berilsa — o'zgartirilmaydi (oldingisi qoladi). */
export async function setCommunityConfig(input: {
  apiKey?: string;
  model: string;
  autoEnabled: boolean;
  operatorIds: string;
  operatorNames: string;
  chatId: string;
}): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

  if (input.apiKey != null && input.apiKey.trim() !== "") await upsert(K_KEY, input.apiKey.trim());
  await upsert(K_MODEL, input.model.trim());
  await upsert(K_AUTO, input.autoEnabled ? "1" : "0");
  await upsert(K_OPS, input.operatorIds.trim());
  await upsert(K_OPN, input.operatorNames.trim());
  await upsert(K_CHAT, input.chatId.trim());
  cache = null;
}

/** Tahlil qilinadigan guruh: sozlamada ko'rsatilgani yoki birinchi faol guruh. */
export async function tahlilChatId(): Promise<bigint | null> {
  const cfg = await getCommunityConfig();
  if (cfg.chatId != null) return cfg.chatId;
  const g = await prisma.tgGroup.findFirst({
    where: { active: true },
    orderBy: { joinedAt: "asc" },
    select: { chatId: true },
  });
  return g?.chatId ?? null;
}
