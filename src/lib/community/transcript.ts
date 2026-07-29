/**
 * Guruh xabarlaridan AI uchun TRANSKRIPT quradi — Gemini'gacha bo'lgan butun tayyorgarlik.
 * Bu modul LLM ni CHAQIRMAYDI: mustaqil sinash va ko'z bilan tekshirish mumkin
 * (`npx tsx scripts/community-transcript.ts <YYYY-MM-DD>`).
 *
 * NEGA OYNA: bitta xabarni alohida ko'rib "javob berildimi" ni aniqlab bo'lmaydi —
 * operator ko'pincha reply QILMASDAN, bir necha daqiqadan keyin javob beradi. Shuning
 * uchun modelga suhbat bo'lagi beriladi.
 *
 * NEGA QAT'IY 50 TALIK: chegarani "jimlik" bo'yicha surish ma'lumotga bog'liq bo'lardi —
 * eksport backfill kunga bitta eski xabar qo'shsa BUTUN kunning oyna chegaralari siljib,
 * barcha `inputHash` lar o'zgarardi va hamma narsa qayta tahlil qilinardi.
 */
import crypto from "crypto";

/** Oynadagi CORE (tahlil qilinadigan) xabarlar soni. */
export const CORE = 50;
/** CORE dan oldin/keyin qo'shiladigan KONTEKST xabarlari (tahlil qilinmaydi, faqat o'qish uchun). */
export const PRE = 10;
export const POST = 12;
/** Bitta xabar matnining promptdagi maksimal uzunligi. */
export const MAX_TEXT = 300;

export interface Msg {
  messageId: number;
  sentAt: Date;
  fromId: bigint | null;
  fromName: string | null;
  fromBot: boolean;
  text: string;
  mediaKind: string | null;
  replyToId: number | null;
  editedAt: Date | null;
}

export interface Window {
  seq: number;
  core: Msg[];
  /** CORE + kontekst — promptga tushadigan to'liq ro'yxat. */
  all: Msg[];
  firstMessageId: number;
  lastMessageId: number;
  msgCount: number;
  inputHash: string;
  /** Modelga beriladigan tayyor matn. */
  text: string;
  /** CORE ichidagi messageId lar — AI javobini validatsiya qilish uchun. */
  coreIds: Set<number>;
}

/**
 * NFKC + ko'rinmas (zero-width) belgilarni olib tashlash. Spam xabarlar aynan shu
 * belgilar bilan filtrlardan qochadi: "Yolg'‌iz‍⁠⁠man‌, y​oz‍ing".
 */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[​-‏⁠-⁯﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Telefon/karta raqamlarini maskalash — shaxsiy ma'lumot uchinchi tomon modeliga ketmasin.
 * Mijoz ismlari ham yuborilmaydi (psevdonim ishlatiladi).
 */
export function maskPII(s: string): string {
  return s
    .replace(/\b\d{16}\b/g, "[karta]")
    .replace(/(?:\+?998)?[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, "[raqam]");
}

/** Faqat minnatdorchilik/salom — tahlilga hissa qo'shmaydi. */
const SHOVQIN =
  /^(rahmat|raxmat|rahmatlar|спасибо|рахмат\w*|ok+|ok\.|xop|xo'p|zo'r|zor|salom|assalom\w*|va alaykum\w*)$/iu;

/**
 * Faqat emoji/tinish belgilaridan iborat (matn yo'q).
 *
 * `\p{Emoji}` ATAYLAB ISHLATILMAYDI: u 0-9 raqamlarini ham qamraydi (ular emoji
 * ketma-ketligining bir qismi bo'la oladi), ya'ni "3990" kabi xabar jimgina
 * tashlanib ketardi. `\p{Extended_Pictographic}` + variation selector (U+FE0F) +
 * ZWJ (U+200D) — kerakli qamrov, raqamlarsiz.
 */
const FAQAT_EMOJI = /^[\p{Extended_Pictographic}️‍\s.…!,?)(]+$/u;

/**
 * AI ga UMUMAN yuborilmaydigan xabarlar.
 * DIQQAT: matnsiz `[foto]` OPERATOR javobi QOLADI — narx so'ralganda javob ko'pincha rasm.
 */
export function tashlanadi(m: Msg, operator: boolean): boolean {
  if (m.fromBot) return true;
  if (operator) return false; // operator xabari har doim qoladi
  const t = normalize(m.text);
  if (!t && !m.mediaKind) return true;
  if (!t && m.mediaKind && !m.replyToId) return true; // mijozning kontekstsiz stikeri
  if (!t) return false;
  return SHOVQIN.test(t) || FAQAT_EMOJI.test(t);
}

function hhmm(d: Date): string {
  // Toshkent = UTC+5, DST yo'q
  const t = new Date(d.getTime() + 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/**
 * Satr formati (token tejaydi va ID ni aniq beradi):
 *   `<messageId> <HH:MM> <OP|M3> [↩<replyTo>] [foto]: <matn>`
 * Mijoz ismi YUBORILMAYDI — oyna ichida barqaror psevdonim (M1, M2 …).
 */
function satr(m: Msg, kim: string): string {
  const reply = m.replyToId ? ` ↩${m.replyToId}` : "";
  const media = m.mediaKind ? ` [${m.mediaKind}]` : "";
  const t = maskPII(normalize(m.text)).slice(0, MAX_TEXT);
  return `${m.messageId} ${hhmm(m.sentAt)} ${kim}${reply}${media}: ${t}`;
}

/**
 * Operatorni aniqlash mezoni. ID afzal, LEKIN HTML eksportida foydalanuvchi ID YO'Q —
 * shuning uchun ism bo'yicha ham (kichik harfda, to'liq moslik) tekshiriladi.
 */
export interface Operatorlar {
  ids: Set<bigint>;
  names: Set<string>;
}

export function operatorMi(m: Msg, ops: Operatorlar): boolean {
  if (m.fromId != null && ops.ids.has(m.fromId)) return true;
  return !!m.fromName && ops.names.has(m.fromName.trim().toLowerCase());
}

/**
 * Xabarlarni oynalarga bo'ladi. `messages` BIR KUNGA tegishli va
 * `(sentAt, messageId)` bo'yicha tartiblangan bo'lishi kerak.
 */
export function buildWindows(messages: Msg[], ops: Operatorlar): Window[] {
  const isOp = (m: Msg) => operatorMi(m, ops);
  const filtered = messages.filter((m) => !tashlanadi(m, isOp(m)));
  if (filtered.length === 0) return [];

  const windows: Window[] = [];
  for (let i = 0, seq = 0; i < filtered.length; i += CORE, seq++) {
    const core = filtered.slice(i, i + CORE);
    const pre = filtered.slice(Math.max(0, i - PRE), i);
    const post = filtered.slice(i + CORE, i + CORE + POST);
    const all = [...pre, ...core, ...post];

    // Psevdonimlar OYNA ICHIDA barqaror: bir mijoz bitta oynada doim bir xil M raqam.
    const nom = new Map<string, string>();
    let n = 0;
    const kim = (m: Msg): string => {
      if (isOp(m)) return "OP";
      const k = m.fromId?.toString() ?? `x${m.messageId}`;
      let v = nom.get(k);
      if (!v) {
        v = `M${++n}`;
        nom.set(k, v);
      }
      return v;
    };

    const lines = all.map((m) => {
      const prefix = core.includes(m) ? "" : "· "; // kontekst satri — tahlil qilinmaydi
      return prefix + satr(m, kim(m));
    });

    // Hash FAQAT core'dan: kontekst qo'shni oynadan kelganda o'zgarishi mumkin,
    // lekin bu oynaning tahlil natijasiga ta'sir qilmaydi.
    const inputHash = crypto
      .createHash("sha256")
      .update(
        core
          .map((m) => `${m.messageId}|${m.editedAt?.getTime() ?? 0}|${normalize(m.text)}`)
          .join("\n")
      )
      .digest("hex");

    windows.push({
      seq,
      core,
      all,
      firstMessageId: core[0].messageId,
      lastMessageId: core[core.length - 1].messageId,
      msgCount: core.length,
      inputHash,
      text: lines.join("\n"),
      coreIds: new Set(core.map((m) => m.messageId)),
    });
  }
  return windows;
}
