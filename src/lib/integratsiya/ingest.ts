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

/**
 * Kassa cheki sanasi: `openDate` "04.08.26" (DD.MM.YY) + `openTime` "16:49:04".
 *
 * ⚠️ Ikki xonali yil 2000-yillar deb o'qiladi (26 → 2026) va zona YO'Q, shuning
 * uchun UTC deb olinadi. 1C bilan ISO formatga (zona bilan) o'tish kelishilsa,
 * yuqoridagi `parse1cDate` uni allaqachon qo'llab-quvvatlaydi va bu funksiya
 * o'z-o'zidan ishlatilmay qoladi.
 */
export function parseOpenDateTime(openDate: unknown, openTime: unknown): Date | null {
  const d = str(openDate);
  if (!d) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(d);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);

  const t = str(openTime) ?? "00:00:00";
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  const [hh, mi, ss] = tm ? [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0)] : [0, 0, 0];

  const dt = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), hh, mi, ss));
  // Rollover tekshiruvi: "31.02.26" jimgina martga surilmasin.
  if (dt.getUTCMonth() !== Number(mm) - 1 || dt.getUTCDate() !== Number(dd)) return null;
  return dt;
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
  // `type` ATAYLAB ro'yxatda: ba'zi manbalar hujjat turini shunday ataydi.
  // Lekin chek payloadida `type: 1` — bu chek TURI (sotuv/vozvrat) raqami,
  // hujjat turi emas. Shuning uchun faqat RAQAM BO'LMAGAN matn qabul qilinadi:
  // aks holda barcha cheklar "1" nomli turga yig'ilib, filtr foydasiz bo'lardi.
  const xomKind = str(
    pick(raw, ["kind", "Kind", "type", "Type", "Тип", "ВидДокумента", "ТипДокумента", "entity"])
  );
  const kind = xomKind && !/^\d+$/.test(xomKind) ? xomKind : UNKNOWN_KIND;

  const externalId = str(
    pick(raw, ["id", "Id", "ID", "ref", "Ref", "Ref_Key", "Ссылка", "guid", "GUID", "uid"])
  );
  const externalNo = str(pick(raw, ["number", "Number", "Номер", "no", "docNumber"]));
  const occurredAt =
    parse1cDate(pick(raw, ["date", "Date", "Дата", "occurredAt", "timestamp"])) ??
    parseOpenDateTime(raw.openDate, raw.openTime);

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

/**
 * Muvaffaqiyatsiz autentifikatsiya uchun tashxis ma'lumoti.
 *
 * NEGA KERAK: endpoint noto'g'ri token uchun ATAYLAB `404` qaytaradi va sababni
 * aytmaydi (borligini ham oshkor qilmaslik uchun). Bu tashqi skanerga qarshi
 * to'g'ri, lekin hamkor jamoa bilan nosozlik izlashda ko'r qoldiradi: "404
 * kelyapti" dan boshqa hech narsa ma'lum bo'lmaydi.
 *
 * ⚠️ TOKEN QIYMATI QAYTARILMAYDI — faqat uzunligi va dastlabki 6 belgisi.
 * Shu bilan "prefiks tushib qolgan / token kesilgan / umuman kelmagan / boshqa
 * token" holatlari ajratiladi, sir esa jurnalga tushmaydi.
 */
export function authTashxis(req: Request, ip: string): Record<string, unknown> {
  const auth = req.headers.get("authorization");
  const alt = req.headers.get("x-ingest-token");

  const bearerPrefiks = auth ? /^bearer\s/i.test(auth) : null;
  const qiymat = (
    auth ? (bearerPrefiks ? auth.replace(/^bearer\s+/i, "") : auth) : (alt ?? "")
  ).trim();

  let path = req.url;
  try {
    path = new URL(req.url).pathname;
  } catch {
    // URL parse bo'lmasa xom qiymat qoladi — tashxis oqimni to'xtatmasin.
  }

  return {
    ip,
    method: req.method,
    path,
    header: auth ? "authorization" : alt ? "x-ingest-token" : "YO'Q",
    bearerPrefiks,
    tokenUzunligi: qiymat.length,
    tokenBoshi: qiymat.slice(0, 6),
    kutilganUzunlik: (process.env.ONEC_INGEST_TOKEN || "").length,
    contentType: req.headers.get("content-type"),
    contentLength: req.headers.get("content-length"),
    ua: req.headers.get("user-agent")?.slice(0, 80) ?? null,
  };
}

// ─── Kodlash (encoding) ──────────────────────────────────────────────────────

/**
 * So'rov tanasini MATNGA aylantiradi, kodlashni o'zi aniqlab.
 *
 * NEGA KERAK: 1C ko'pincha **windows-1251** da chiqaradi. `req.json()` esa tanani
 * har doim UTF-8 deb o'qiydi — natijada kirill matn U+FFFD ga aylanadi va
 * QAYTARIB BO'LMAYDI (kassir ismi, tovar nomi, to'lov turi yo'qoladi).
 * Bu faraziy emas: 1C bergan birinchi namuna faylda aynan shu sodir bo'lgan
 * (106 ta U+FFFD), ikkinchisi esa toza cp1251 bo'lib keldi.
 *
 * Tartib: Content-Type dagi charset → qat'iy UTF-8 → cp1251.
 */
export function decodeBody(buf: Uint8Array, contentType?: string | null): string {
  const charset = /charset=([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase();

  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      return new TextDecoder(charset).decode(buf);
    } catch {
      // Noma'lum charset — quyidagi avtomatik aniqlashga tushamiz.
    }
  }

  // Qat'iy UTF-8: yaroqsiz ketma-ketlik bo'lsa XATO beradi (jimgina U+FFFD emas).
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // UTF-8 emas — 1C uchun eng ehtimolli variant.
    return new TextDecoder("windows-1251").decode(buf);
  }
}
