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
const K_SKIP = "STOCKDAY_EXCLUDE_CODES"; // hisobotdan chiqariladigan tovar kodlari

/**
 * Kodlar ro'yxatini o'qiydi: vergul, bo'shliq va yangi qator bilan ajratilgani ham bo'ladi.
 * Raqam bo'lmagan bo'laklar jimgina tashlanadi — foydalanuvchi izoh yozib qo'ysa
 * ham ro'yxat buzilmaydi.
 */
export function parseExcludeCodes(raw: string | null | undefined): number[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map(Number)
        .filter((n) => n > 0)
    ),
  ];
}

export type StockdayReportConfig = {
  token: string | null;
  chatId: string | null;
  topicId: number | null;
  autoEnabled: boolean;
  /**
   * Hisobotdan chiqariladigan tovar kodlari.
   *
   * NEGA ARXIV EMAS: arxivlangan SKU sotuv fayli yuklanganda avtomatik aktivga
   * qaytadi (`admin/upload/actions.ts` — "savdo qayta boshlangani aktivlikning
   * o'zi"). Kunlik sotiladigan xizmat qatorlari (masalan "DOSTAVKA", qoldig'i
   * shartli 100 000 qilib qo'yilgan) shu sabab arxivda turmaydi. Bu ro'yxat esa
   * yuklashga bog'liq emas va ko'rinib turadi.
   */
  excludeCodes: number[];
};

let cache: { val: StockdayReportConfig; at: number } | null = null;

export async function getStockdayReportConfig(): Promise<StockdayReportConfig> {
  const now = Date.now();
  if (cache && now - cache.at < 5 * 60_000) return cache.val;
  const rows = await prisma.appSetting
    .findMany({ where: { key: { in: [K_TOKEN, K_CHAT, K_TOPIC, K_AUTO, K_SKIP] } } })
    .catch(() => [] as { key: string; value: string }[]);
  const m = new Map(rows.map((r) => [r.key, r.value?.trim() || ""]));
  const topicRaw = (process.env.STOCKDAY_TOPIC_ID || m.get(K_TOPIC) || "").trim();
  const val: StockdayReportConfig = {
    token: process.env.STOCKDAY_BOT_TOKEN || m.get(K_TOKEN) || null,
    chatId: process.env.STOCKDAY_GROUP_CHAT_ID || m.get(K_CHAT) || null,
    topicId: /^\d+$/.test(topicRaw) ? Number(topicRaw) : null,
    autoEnabled: (m.get(K_AUTO) || "") === "1",
    excludeCodes: parseExcludeCodes(m.get(K_SKIP)),
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
  excludeCodes: string;
}): Promise<void> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (input.token != null && input.token.trim() !== "") await upsert(K_TOKEN, input.token.trim());
  await upsert(K_CHAT, input.chatId.trim());
  await upsert(K_TOPIC, input.topicId.trim());
  await upsert(K_AUTO, input.autoEnabled ? "1" : "0");
  // Normallashtirib saqlaymiz — keyingi safar ochilganda tartibli ko'rinadi.
  await upsert(K_SKIP, parseExcludeCodes(input.excludeCodes).join(", "));
  cache = null;
}

export function clearStockdayReportConfigCache(): void {
  cache = null;
}
