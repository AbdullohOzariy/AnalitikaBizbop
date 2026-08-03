/**
 * 1C PUSH qabul qilish — yordamchi mantiq (endpoint'dan ajratilgan, test qilinadi).
 *
 * DIZAYN QARORI: bu qatlam payload'ni TUSHUNISHGA urinmaydi. Uning yagona vazifasi —
 * kelgan JSON'ni yo'qotmasdan, dublikatsiz saqlash. Sxema kelishuvi davom etayotgani
 * uchun har qanday qattiq validatsiya ma'lumot yo'qotish xavfini tug'diradi.
 */

import crypto from "crypto";

/** Bitta hodisa — 1C yuboradigan minimal shakl. Hammasi ixtiyoriy: kelmasa ham qabul qilamiz. */
export type RawEvent = {
  kind?: unknown;
  id?: unknown;
  number?: unknown;
  date?: unknown;
  data?: unknown;
  [k: string]: unknown;
};

export type NormalizedEvent = {
  kind: string;
  externalId: string | null;
  externalNo: string | null;
  occurredAt: Date | null;
  payload: Record<string, unknown>;
  payloadHash: string;
};

/** Turli yozilishlarni bitta kalitga keltiradi: `kind` / `Тип` / `type` / `ВидДокумента`. */
function pick(obj: RawEvent, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
};

/**
 * 1C sanasi. OData odatda "2026-08-03T10:22:00" (zonasiz) qaytaradi — bunday satr
 * `new Date()` da MAHALLIY zonada o'qiladi va server zonasiga qarab kun siljiydi.
 * Shuning uchun zonasiz satrni ATAYLAB UTC deb o'qiymiz; haqiqiy zona 1C bilan
 * kelishilgach shu joyda bitta o'zgartirish bilan to'g'rilanadi.
 */
export function parse1cDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
  const iso = hasZone ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // 1C bo'sh sanani "0001-01-01T00:00:00" bilan belgilaydi — bu sana emas.
  if (d.getUTCFullYear() < 1900) return null;
  return d;
}

/** Payload'ning barqaror sha256'si: kalitlar tartibi o'zgarsa ham hash O'ZGARMAYDI. */
export function stableHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(canonical);
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, val]) => [k, canonical(val)])
    );
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Turi aniqlanmagan hodisa shu nom bilan saqlanadi — rad etilmaydi. */
export const UNKNOWN_KIND = "UNKNOWN";

export function normalizeEvent(raw: RawEvent): NormalizedEvent {
  const kind =
    str(pick(raw, ["kind", "Kind", "type", "Type", "Тип", "ВидДокумента", "ТипДокумента", "entity"])) ??
    UNKNOWN_KIND;

  const externalId = str(
    pick(raw, ["id", "Id", "ID", "ref", "Ref", "Ref_Key", "Ссылка", "guid", "GUID", "uid"])
  );
  const externalNo = str(pick(raw, ["number", "Number", "Номер", "no", "docNumber"]));
  const occurredAt = parse1cDate(pick(raw, ["date", "Date", "Дата", "occurredAt", "timestamp"]));

  // Payload — TO'LIQ obyekt (faqat `data` emas): 1C ustki darajaga ham maydon
  // qo'shishi mumkin va uni tashlab yuborsak tiklab bo'lmaydi.
  const payload = raw as Record<string, unknown>;

  return { kind, externalId, externalNo, occurredAt, payload, payloadHash: stableHash(payload) };
}

/**
 * So'rov tanasidan hodisalar ro'yxatini ajratadi. Uch shakl ham qabul qilinadi:
 *   1. bitta obyekt                    → [obyekt]
 *   2. massiv                          → o'zi
 *   3. { events: [...] } / { data: [...] } / { items: [...] }
 * Shakl qattiq belgilanmagani — 1C tomonda ishni yengillashtiradi.
 */
export function extractEvents(body: unknown): RawEvent[] | { error: string } {
  if (Array.isArray(body)) return body as RawEvent[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["events", "Events", "data", "items", "Документы", "rows"]) {
      if (Array.isArray(o[key])) return o[key] as RawEvent[];
    }
    return [o as RawEvent];
  }
  return { error: "JSON obyekt yoki massiv bo'lishi kerak." };
}

/** Bitta so'rovda qabul qilinadigan maksimal hodisa. */
export const MAX_EVENTS_PER_REQUEST = 1000;
/** So'rov tanasi uchun chegara (baytda) — 1C katta partiya yuborib qo'ymasin. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Token doimiy vaqtli solishtirish — uzunlik farqi ham sirni oshkor qilmasin. */
export function tokenMatches(got: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Uzunlik bo'yicha erta chiqish vaqt kanalini ochadi — bir xil uzunlikka
    // keltirib baribir taqqoslaymiz, natija esa false bo'lib qoladi.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
