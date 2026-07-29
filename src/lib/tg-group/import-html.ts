/**
 * Telegram Desktop "Export chat history → HTML" faylini o'qish.
 *
 * JSON eksporti AFZAL (unda `from_id` bor). HTML'da foydalanuvchi ID YO'Q — faqat ism,
 * shuning uchun bu manbadan kelgan xabarlarda `fromId = null` bo'ladi va operator
 * ISM bo'yicha aniqlanadi (`COMMUNITY_OPERATOR_NAMES`).
 *
 * HTML tuzilishi (Telegram Desktop):
 *   <div class="message default clearfix[ joined]" id="message529519">
 *     <div class="pull_right date details" title="27.07.2026 08:00:21 UTC+05:00">
 *     <div class="from_name">bizbop</div>        ← `joined` bo'lsa YO'Q (oldingisidan meros)
 *     <div class="reply_to details">… GoToMessage(529520) …</div>
 *     <div class="media_wrap …"> yoki <div class="text">matn</div>
 */
import { TASHKENT_OFFSET_MS, isoDay } from "@/lib/date";
import type { ParsedMessage } from "./import";

const BLOK = /<div class="message default clearfix( joined)?" id="message(\d+)">([\s\S]*?)(?=<div class="message |<\/div>\s*<\/div>\s*<\/section>|$)/g;
const SANA = /class="pull_right date details" title="([^"]+)"/;
const NOM = /<div class="from_name">\s*([\s\S]*?)\s*<\/div>/;
const REPLY = /GoToMessage\((\d+)\)/;
const MATN = /<div class="text">\s*([\s\S]*?)\s*<\/div>/;

/** HTML teglarni olib tashlab, entity'larni ochadi. */
function matnTozala(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** "27.07.2026 08:00:21 UTC+05:00" → Date (UTC). */
function sanaParse(s: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\s*UTC([+-]\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  const [, dd, MM, yyyy, hh, mm, ss, tzH, tzM] = m;
  const local = Date.UTC(+yyyy, +MM - 1, +dd, +hh, +mm, +ss);
  // TZ berilgan bo'lsa uni ayiramiz; berilmasa Toshkent deb qabul qilamiz.
  const offsetMs =
    tzH != null ? (Number(tzH) * 60 + Math.sign(Number(tzH)) * Number(tzM)) * 60_000 : TASHKENT_OFFSET_MS;
  return new Date(local - offsetMs);
}

function mediaAniqla(blok: string): string | null {
  if (/class="photo_wrap/.test(blok)) return "photo";
  if (/class="sticker/.test(blok) || /media_photo.*[Ss]ticker/.test(blok)) return "sticker";
  if (/video_file_wrap|media_video/.test(blok)) return "video";
  if (/media_voice_message/.test(blok)) return "voice";
  if (/media_audio_file/.test(blok)) return "audio";
  if (/animated_wrap|media_animation/.test(blok)) return "animation";
  if (/class="media_wrap|media_file/.test(blok)) return "document";
  return null;
}

export interface HtmlParseResult {
  messages: ParsedMessage[];
  skipped: { noDate: number; empty: number };
  names: Map<string, number>;
}

/** HTML eksport matnidan xabarlarni ajratadi. `chatId` — Bot API formatida berilishi SHART. */
export function parseHtmlExport(html: string, chatId: bigint): HtmlParseResult {
  const messages: ParsedMessage[] = [];
  const skipped = { noDate: 0, empty: 0 };
  const names = new Map<string, number>();
  let oxirgiNom: string | null = null;

  for (const m of html.matchAll(BLOK)) {
    const joined = !!m[1];
    const messageId = Number(m[2]);
    const blok = m[3];

    const sanaM = SANA.exec(blok);
    const sentAt = sanaM ? sanaParse(sanaM[1]) : null;
    if (!sentAt) {
      skipped.noDate++;
      continue;
    }

    // `joined` blokda ism yo'q — oldingi xabardan meros oladi
    const nomM = NOM.exec(blok);
    const fromName: string | null = nomM ? matnTozala(nomM[1]) : joined ? oxirgiNom : null;
    if (fromName) oxirgiNom = fromName;

    const matnM = MATN.exec(blok);
    const text = matnM ? matnTozala(matnM[1]) : "";
    const mediaKind = mediaAniqla(blok);
    if (!text && !mediaKind) {
      skipped.empty++;
      continue;
    }

    const replyM = REPLY.exec(blok);
    if (fromName) names.set(fromName, (names.get(fromName) ?? 0) + 1);

    messages.push({
      chatId,
      messageId,
      threadId: null,
      sentAt,
      dayKey: isoDay(new Date(sentAt.getTime() + TASHKENT_OFFSET_MS)),
      fromId: null, // HTML eksportida foydalanuvchi ID YO'Q
      fromName: fromName ? fromName.slice(0, 120) : null,
      fromBot: false,
      text,
      mediaKind,
      replyToId: replyM ? Number(replyM[1]) : null,
      editedAt: null,
      source: "EXPORT",
    });
  }

  return { messages, skipped, names };
}
