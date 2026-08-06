/**
 * 1C qabul endpointi uchun HMAC imzo — tanani va yuboruvchini tasdiqlash.
 *
 * NEGA KERAK: 1C tomon HTTP (shifrsiz) so'rashi mumkin. Shifrsiz kanalda
 * `Authorization: Bearer <token>` header OCHIQ ketadi — yo'ldagi har kim uni
 * o'qib olib, o'zi ham so'rov yubora oladi. Ya'ni HTTP ustida token YAKKA
 * O'ZI hech narsani himoya qilmaydi.
 *
 * HMAC bunday emas: sir (secret) HECH QACHON simda ketmaydi, faqat undan
 * hisoblangan imzo ketadi. Imzoni qayta ishlatib bo'lmaydi, chunki u tananing
 * va vaqtning aynan o'ziga bog'langan.
 *
 * ⚠️ SIR ALOHIDA BO'LISHI SHART: `ONEC_INGEST_SECRET` ≠ `ONEC_INGEST_TOKEN`.
 * Agar ikkalasi bir xil bo'lsa, tokenni ushlagan odam imzo kalitini ham bilib
 * oladi va butun himoya yo'qqa chiqadi.
 *
 * NIMANI HIMOYA QILADI: yuboruvchi haqiqiyligini va tana o'zgartirilmaganini.
 * NIMANI QILMAYDI: HTTP'da MAZMUNNI YASHIRMAYDI — chek summalari o'qilishi
 * mumkin. Maxfiylik faqat HTTPS bilan bo'ladi.
 */
import crypto from "crypto";

/** Imzo talab qilinishini yoqib/o'chirish (AppSetting kaliti). */
export const HMAC_REQUIRED_KEY = "onec_hmac_required";

/** Header nomlari — 1C tomonga shu nomlar beriladi. */
export const IMZO_HEADER = "x-ingest-signature";
export const VAQT_HEADER = "x-ingest-timestamp";

/**
 * Ruxsat etilgan vaqt farqi (soniya). ±5 daqiqa: ushlab olingan eski so'rovni
 * qayta yuborishning (replay) oynasi shuncha bilan cheklanadi.
 *
 * Kengroq olinmadi — oyna qancha katta bo'lsa, qayta yuborish imkoni shuncha
 * uzoq yashaydi. Torroq ham olinmadi: 1C serveridagi soat bir necha daqiqaga
 * chalkash bo'lishi odatiy hol.
 */
export const IMZO_OYNA_SEK = 300;

export type ImzoNatija =
  | { ok: true; holat: "tekshirildi" | "imzosiz" }
  | { ok: false; sabab: string };

/**
 * Vaqt belgisini soniyaga keltiradi.
 *
 * Uch shakl qabul qilinadi, chunki 1C tomonda qaysi biri chiqishi oldindan
 * ma'lum emas: unix soniya, unix millisekund va ISO-8601.
 */
export function timestampSekund(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    // 13 xonali = millisekund (2001-yildan keyingi har qanday ms shunday).
    return s.length >= 12 ? Math.floor(n / 1000) : n;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

/**
 * Imzo qiymati: HMAC-SHA256( secret, "<timestamp>." + <tana baytlari> ) → hex.
 *
 * Tana XOM BAYT bo'yicha imzolanadi, dekodlangan matn bo'yicha emas: 1C
 * windows-1251 da yuborsa, matnga aylantirish jarayonida baytlar o'zgaradi va
 * imzo hech qachon mos kelmasdi.
 *
 * Vaqt belgisi imzo ichida — aks holda uni yo'lda o'zgartirib, eski so'rovni
 * "yangi" qilib ko'rsatish mumkin bo'lardi.
 */
export function imzoHisobla(secret: string, timestamp: string, tana: Uint8Array): string {
  return crypto
    .createHmac("sha256", secret)
    .update(Buffer.from(`${timestamp}.`, "utf8"))
    .update(Buffer.from(tana))
    .digest("hex");
}

/** Hex imzolarni doimiy vaqtda solishtiradi (registr farqi hisobga olinmaydi). */
function imzoTeng(got: string, kutilgan: string): boolean {
  const a = Buffer.from(got.trim().toLowerCase(), "utf8");
  const b = Buffer.from(kutilgan, "utf8");
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b); // vaqt kanalini ochmaslik uchun
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Imzoni tekshiradi.
 *
 * O'TISH DAVRI MANTIG'I: imzo KELGAN bo'lsa — har doim tekshiriladi (noto'g'ri
 * bo'lsa rad etiladi). Kelmagan bo'lsa — `talabQilinadi` hal qiladi. Shu
 * tufayli 1C hali imzolashni qo'shmagan paytda ham oqim to'xtamaydi, biz esa
 * tayyor bo'lganda bitta tugma bilan majburiy qila olamiz.
 */
export function imzoTekshir(opts: {
  secret: string | undefined | null;
  imzo: string | null | undefined;
  vaqt: string | null | undefined;
  tana: Uint8Array;
  talabQilinadi: boolean;
  hozirSek?: number;
}): ImzoNatija {
  const { secret, imzo, vaqt, tana, talabQilinadi } = opts;
  const hozir = opts.hozirSek ?? Math.floor(Date.now() / 1000);
  const bor = Boolean(imzo && imzo.trim());

  if (!bor) {
    if (!talabQilinadi) return { ok: true, holat: "imzosiz" };
    return { ok: false, sabab: "Imzo yo'q. X-Ingest-Signature header kerak." };
  }

  // Imzo kelgan, lekin bizda sir sozlanmagan — tekshirib bo'lmaydi.
  // "O'tkazib yuborish" XAVFLI bo'lardi: himoya bor deb o'ylab, aslida yo'q.
  if (!secret) {
    return { ok: false, sabab: "Server tomonda imzo kaliti sozlanmagan." };
  }

  const ts = timestampSekund(vaqt);
  if (ts === null) {
    return { ok: false, sabab: "X-Ingest-Timestamp yo'q yoki noto'g'ri." };
  }

  const farq = Math.abs(hozir - ts);
  if (farq > IMZO_OYNA_SEK) {
    return {
      ok: false,
      sabab: `Vaqt farqi katta (${farq} sek). Serverdagi soatni tekshiring.`,
    };
  }

  // Imzo XOM header qiymati bo'yicha hisoblanadi: normalizatsiya qilsak,
  // 1C yuborgan satr bilan bizniki farq qilib qolardi.
  const kutilgan = imzoHisobla(secret, (vaqt ?? "").trim(), tana);
  if (!imzoTeng(imzo!, kutilgan)) {
    return { ok: false, sabab: "Imzo mos kelmadi." };
  }

  return { ok: true, holat: "tekshirildi" };
}
