/**
 * Kanonik mahsulot nomi uchun KALITLAR. Bu modul DB kontraktining bir qismi:
 * `TgCanonProduct.nameKey` UNIQUE indeksi aynan `canonKey()` natijasini saqlaydi.
 *
 * SHUNING UCHUN: `canonKey()` ni o'zgartirish = bazadagi barcha kalitlarni qayta
 * hisoblash. Test yozilgan (kanon-kalit.test.ts) — u shartnomani muzlatadi.
 *
 * Ikki kalit ATAYLAB alohida:
 *   canonKey  — QAT'IY unikallik kaliti. "Shaftoli" va "шафтоли" bir xil kalit beradi.
 *   fuzzyKey  — YUMSHOQ qidiruv kaliti. "Shaftoli 1kg", "shaftolilar" ham "shaftoli" ga
 *               tushadi. UNIKAL EMAS — faqat nomzod izlash va dublikat sweep uchun.
 */

/** Kirill (rus + o'zbek) → lotin. Ko'p harfli almashinuvlar OLDIN kelishi shart. */
const KIRILL: [RegExp, string][] = [
  [/щ/g, "sh"],
  [/ш/g, "sh"],
  [/ч/g, "ch"],
  [/ц/g, "ts"],
  [/ю/g, "yu"],
  [/я/g, "ya"],
  [/ё/g, "yo"],
  [/ж/g, "j"],
  [/ў/g, "o"],
  [/қ/g, "q"],
  [/ғ/g, "g"],
  [/ҳ/g, "h"],
  [/х/g, "x"],
  [/а/g, "a"],
  [/б/g, "b"],
  [/в/g, "v"],
  [/г/g, "g"],
  [/д/g, "d"],
  [/е/g, "e"],
  [/з/g, "z"],
  [/и/g, "i"],
  [/й/g, "y"],
  [/к/g, "k"],
  [/л/g, "l"],
  [/м/g, "m"],
  [/н/g, "n"],
  [/о/g, "o"],
  [/п/g, "p"],
  [/р/g, "r"],
  [/с/g, "s"],
  [/т/g, "t"],
  [/у/g, "u"],
  [/ф/g, "f"],
  [/ы/g, "i"],
  [/э/g, "e"],
  [/ъ/g, ""],
  [/ь/g, ""],
];

/**
 * Apostrofning barcha ko'rinishlari — o'zbek matnidagi eng beqaror belgi.
 * ATAYLAB Unicode escape: manba faylda "‘" va "’" oddiy apostrofga aylanib qolishi
 * mumkin (tahrirlagich/nusxalash) va qoida jimgina buziladi — test aynan shuni tutdi.
 * U+0027 ' · U+2018 ‘ · U+2019 ’ · U+02BB ʻ · U+02BC ʼ · U+02C8 ˈ · U+0060 ` · U+00B4 ´ · U+2032 ′
 */
const APOSTROF = /['\u2018\u2019\u02BB\u02BC\u02C8\u0060\u00B4\u2032]/g;

/**
 * QAT'IY kalit: registr, kirill/lotin, apostrof va ortiqcha bo'shliq farqi yo'qoladi.
 *   "Shaftoli" · "shaftoli" · "ШАФТОЛИ" · "shaftoli"  →  "shaftoli"
 *   "Persik" · "Персик"                                →  "persik"
 * DIQQAT: "Persik" va "Shaftoli" TURLI kalitlar — ularni birlashtirish AI ning ishi
 * (alias orqali), kalit funksiyasining emas.
 */
export function canonKey(s: string): string {
  let t = (s ?? "").normalize("NFKC").toLowerCase();
  t = t.replace(APOSTROF, "");
  for (const [re, rep] of KIRILL) t = t.replace(re, rep);
  // Harf/raqam/bo'shliqdan boshqasi — bo'shliqqa (tinish belgilari, qavs, chiziqcha)
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ");
  return t.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** O'lchov birliklari va miqdor — mahsulot AYNIYATIGA ta'sir qilmaydi. */
const OLCHOV = /\b\d+([.,]\d+)?\s*(kg|kilo|gr|gramm|g|ml|l|litr|dona|sht|piece|kq|кг|гр|г|мл|л|шт)\b/g;
const RAQAM = /\b\d+([.,]\d+)?\b/g;
/** O'zbekcha ko'plik va kelishik qo'shimchalari (sodda, xavfsiz to'plam). */
const QOSHIMCHA = /(lari|lar|ler|ni|ning|ga|da|dan)\b/g;

/**
 * YUMSHOQ kalit — nomzod izlash uchun.
 *   "Shaftoli 1kg" · "shaftolilar" · "shaftoli 500 gr"  →  "shaftoli"
 * UNIKAL EMAS: turli mahsulotlar bir xil fuzzyKey berishi mumkin, shuning uchun
 * fuzzy tenglik AVTO-bog'lash uchun FAQAT nomzod yagona bo'lganda ishlatiladi.
 */
export function fuzzyKey(s: string): string {
  let t = canonKey(s);
  t = t.replace(OLCHOV, " ").replace(RAQAM, " ");
  t = t.replace(QOSHIMCHA, "");
  return t.replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Ko'rsatiladigan kanonik nom uslubi — SERVERDA majburlanadi (modelga ishonilmaydi):
 * ortiqcha bo'shliqsiz, faqat birinchi harf katta.
 *   "  SHAFTOLI  " → "Shaftoli" · "qora uzum" → "Qora uzum"
 */
export function kanonNom(s: string): string {
  const t = (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return "";
  return t.charAt(0).toLocaleUpperCase("uz") + t.slice(1).toLocaleLowerCase("uz");
}
