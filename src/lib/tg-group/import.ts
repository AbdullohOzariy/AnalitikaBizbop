/**
 * Telegram Desktop "Export chat history (JSON)" faylini `TgGroupMessage` ga o'girish.
 *
 * NEGA kerak: bot guruhga qo'shilgunga qadar bo'lgan xabarlarni Bot API HECH QACHON
 * bermaydi (tarixga kirish metodi yo'q). Shuning uchun o'tmish faqat eksport orqali
 * keladi. Jonli webhook bilan bitta jadvalga yozamiz — statistika yagona manbadan.
 */
import { TASHKENT_OFFSET_MS, isoDay } from "@/lib/date";

/** Eksport JSON'idagi xabar (bizga kerakli maydonlar). */
interface ExportMessage {
  id?: number;
  type?: string; // "message" | "service"
  date?: string; // mahalliy vaqt, TZ belgisisiz — ISHONMAYMIZ
  date_unixtime?: string; // UTC epoch (soniya) — ASOSIY manba
  edited_unixtime?: string;
  edited?: string;
  from?: string | null;
  from_id?: string | number | null; // "user123456" | "channel123456"
  reply_to_message_id?: number | null;
  text?: unknown; // string | (string | {type,text})[]
  photo?: string;
  file?: string;
  media_type?: string; // voice_message | sticker | video_file | animation | audio_file …
  sticker_emoji?: string;
}

interface ExportRoot {
  name?: string;
  type?: string; // public_supergroup | private_supergroup | private_group | …
  id?: number;
  messages?: ExportMessage[];
}

export interface ParsedMessage {
  chatId: bigint;
  messageId: number;
  threadId: number | null;
  sentAt: Date;
  dayKey: string;
  fromId: bigint | null;
  fromName: string | null;
  fromBot: boolean;
  text: string;
  mediaKind: string | null;
  replyToId: number | null;
  editedAt: Date | null;
  source: "EXPORT";
}

export interface ParseResult {
  chatId: bigint;
  title: string | null;
  messages: ParsedMessage[];
  skipped: { service: number; noId: number; noDate: number; empty: number };
}

/**
 * Eksportdagi guruh `id` ni Bot API `chat.id` formatiga keltiradi.
 * Supergroup/kanal: 1234567890 -> -1001234567890. Oddiy (basic) guruh: -> -1234567890.
 * Bu SHART — jonli webhook Bot API formatida yozadi, ikkisi bir xil bo'lmasa
 * eksport va jonli xabarlar boshqa-boshqa "guruh" bo'lib qoladi.
 */
export function toBotApiChatId(exportId: number, chatType?: string): bigint {
  const raw = Math.abs(exportId);
  if (chatType && chatType.includes("group") && !chatType.includes("supergroup")) {
    return -BigInt(raw); // basic group
  }
  return BigInt(`-100${raw}`); // supergroup / channel
}

/** "user123456" | "channel123456" | 123456 -> bigint (kanal manfiy). */
function parseFromId(v: string | number | null | undefined): bigint | null {
  if (v == null) return null;
  if (typeof v === "number") return BigInt(v);
  const m = /^([a-z]*)(\d+)$/.exec(v.trim());
  if (!m) return null;
  const n = BigInt(m[2]);
  return m[1] === "channel" || m[1] === "chat" ? -n : n;
}

/**
 * `text` maydoni string yoki (string | {type,text})[] bo'lishi mumkin —
 * link/mention/bold bo'laklarga ajraladi. Hammasini bitta matnga yig'amiz.
 */
export function flattenText(text: unknown): string {
  if (typeof text === "string") return text;
  if (!Array.isArray(text)) return "";
  return text
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const t = (part as { text?: unknown }).text;
        return typeof t === "string" ? t : "";
      }
      return "";
    })
    .join("");
}

function mediaKindOf(m: ExportMessage): string | null {
  if (m.media_type) {
    const map: Record<string, string> = {
      voice_message: "voice",
      video_message: "video_note",
      video_file: "video",
      audio_file: "audio",
      animation: "animation",
      sticker: "sticker",
    };
    return map[m.media_type] ?? m.media_type.slice(0, 20);
  }
  if (m.photo) return "photo";
  if (m.sticker_emoji) return "sticker";
  if (m.file) return "document";
  return null;
}

/**
 * Telegram 2013-yildan beri ishlaydi — undan oldingi epoch buzuq qator degani
 * (kesilgan raqam, bo'shliq). Bunday qiymat JIMGINA 1970-yilga tushib, kunlik
 * statistikani buzardi — shuning uchun rad etiladi va `date` ga o'tiladi.
 */
const MIN_EPOCH_SEC = 1_356_998_400; // 2013-01-01

function epochToDate(unix: string | undefined, fallbackIso: string | undefined): Date | null {
  if (unix) {
    const n = Number(unix.trim());
    if (Number.isFinite(n) && n >= MIN_EPOCH_SEC) return new Date(n * 1000);
  }
  // Zaxira: "2026-07-27T10:23:45" — TZ belgisi yo'q, eksport qurilmaning mahalliy
  // vaqti. Toshkent deb qabul qilamiz (guruh shu yerda ishlatiladi).
  if (fallbackIso) {
    const t = Date.parse(`${fallbackIso}Z`);
    if (Number.isFinite(t)) return new Date(t - TASHKENT_OFFSET_MS);
  }
  return null;
}

/** Eksport JSON (parse qilingan obyekt) -> yozishga tayyor xabarlar. */
export function parseExport(root: ExportRoot, chatIdOverride?: bigint): ParseResult {
  const chatId =
    chatIdOverride ??
    (typeof root.id === "number" ? toBotApiChatId(root.id, root.type) : null);
  if (chatId == null) {
    throw new Error("Eksport faylida guruh `id` topilmadi — chatId'ni qo'lda bering.");
  }

  const skipped = { service: 0, noId: 0, noDate: 0, empty: 0 };
  const messages: ParsedMessage[] = [];
  const seen = new Set<number>(); // bitta faylda dublikat id bo'lsa (kamdan-kam)

  for (const m of root.messages ?? []) {
    if (m.type === "service") {
      skipped.service++;
      continue;
    }
    if (typeof m.id !== "number") {
      skipped.noId++;
      continue;
    }
    const sentAt = epochToDate(m.date_unixtime, m.date);
    if (!sentAt) {
      skipped.noDate++;
      continue;
    }

    const text = flattenText(m.text).trim();
    const mediaKind = mediaKindOf(m);
    if (!text && !mediaKind) {
      skipped.empty++; // na matn, na media — tahlilga hissa qo'shmaydi
      continue;
    }
    if (seen.has(m.id)) continue;
    seen.add(m.id);

    messages.push({
      chatId,
      messageId: m.id,
      threadId: null, // eksport topic'ni ishonchli bermaydi — jonli oqimda to'ladi
      sentAt,
      dayKey: isoDay(new Date(sentAt.getTime() + TASHKENT_OFFSET_MS)),
      fromId: parseFromId(m.from_id),
      fromName: m.from ? m.from.slice(0, 120) : null,
      fromBot: false, // eksportda bot belgisi yo'q
      text,
      mediaKind,
      replyToId: m.reply_to_message_id ?? null,
      editedAt: epochToDate(m.edited_unixtime, m.edited),
      source: "EXPORT",
    });
  }

  return { chatId, title: root.name ?? null, messages, skipped };
}
