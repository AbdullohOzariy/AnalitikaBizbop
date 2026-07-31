/**
 * KALIBRATSIYA — model chiqishini o'z xatolar tarixiga qarab to'g'rilaydi.
 *
 * Ikkisi ham O'LCHOVDAN chiqqan, taxmindan emas (13 oyna, 249 946 baho, rolling —
 * koeffitsient FAQAT o'zidan oldingi oynalardan olingan, ya'ni sizib chiqish yo'q):
 *
 * 1. BIAS TUZATISH. Model tizimli KO'P prognoz qiladi (BIAS +7.4%). Sabab tuzilmaviy:
 *    siyrak talabda oxirgi 4 haftada bitta cho'qqi bo'lsa MA4 uni "yangi daraja" deb
 *    oladi. Bitta GLOBAL koeffitsient eng yaxshi ishladi:
 *      tuzatishsiz  WAPE 48.5% · BIAS +7.4% · FVA 5.0%
 *      global       WAPE 46.7% · BIAS −0.2% · FVA 8.5%   ← g'olib
 *      sinf         WAPE 47.0% · BIAS +0.7% · FVA 7.9%
 *      sinf×abc     WAPE 46.9% · BIAS +3.1% · FVA 8.1%
 *    Ya'ni MAYDA kesimga bo'lish YOMONLASHTIRADI (shovqinga moslashish). Global
 *    koeffitsientda ma'lumot eng ko'p — shuning uchun eng barqaror.
 *
 * 2. q90 — EMPIRIK KVANTIL, formula EMAS. Talab SANOQ tabiatiga ega (σ ∝ √o'rtacha),
 *    shuning uchun qoldiq √(p50+1) ga normalizatsiya qilinadi. To'rt SHAKL o'lchandi
 *    (qoplash / ortiqcha dona / kamomad dona, seriya-oynasiga):
 *      formula (p50+z·σ·√h)   84.5% · 22.8 · 2.8   ← maqsad 90% edi, YETMAYDI
 *      multiplikativ (m·p50)  84.6% · 56.6 · 2.2   ← LUMPY'da 74.9% (p50=0 qoplanmaydi)
 *      additiv (p50+a)        90.6% · 17.8 · 4.5
 *      √-masshtab             90.7% · 20.9 · 3.7   ← g'olib
 *
 *    MUHIM CHEKLOV: multiplikativ qoida INTERMITTENT/LUMPY'da PRINSIPIAL ishlamaydi —
 *    bu sinflarda p50 = 0 bo'lgan oynalar 29% va 56%, `m · 0 = 0` esa hech qachon
 *    qoplamaydi. Shu sabab qoida ADDITIV shaklda: q90 = p50 + c·√(p50+1).
 *
 * 3. KALIT — `ABC × kattalik bandi` (Faza 3.1). Shakl to'g'ri bo'lsa ham, `c` ni
 *    QAYSI kesimda o'rganish alohida savol va u ham o'lchandi:
 *      sinf×abc      JAMI 90.7% · A 85.1% · C 92.6%   ← A tizimli tanqis
 *      band          JAMI 90.3% · A 79.8% · C 95.7%   ← ABC'siz bo'lmaydi
 *      abc×band      JAMI 91.2% · A 89.9% · C 91.2%
 *      abc×band √    JAMI 91.2% · A 89.9% · C 91.0%   ← g'olib (kamomad eng kam)
 *    `sinf×abc×band` ham sinaldi — `abc×band` bilan TENG (A 89.9%), demak soddaroq
 *    kalit tanlandi. Eng katta yutuq `1k+` bandda: qoplash 76.1% → 89.8%, kamomad
 *    344 → 217 dona/oyna.
 */
import type { Sinf } from "./panel";

/** Maqsad servis darajasi (qoplash ehtimoli). Har run o'z qiymatini saqlaydi. */
export const SERVIS = 0.9;

/**
 * Kalibratsiya necha oxirgi baho oynasidan o'rganadi.
 *
 * O'LCHANGAN (13 oyna, BIAS tuzatish xotirasi):
 *   2 oyna  BIAS −0.3% · oyna |BIAS| tarqoqligi 5.1%
 *   4 oyna  BIAS −1.0% · 5.7%
 *   6 oyna  BIAS −1.8% · 6.2%
 *   12/kengayuvchi  BIAS −2.9% · 7.1%
 * WAPE hamma variantda 46.5–46.6% (farq shovqin darajasida). Ya'ni BIAS SILJIB
 * TURADI — uzun xotira o'tmishga yopishib qoladi va tuzatishni orqada qoldiradi.
 *
 * 4 tanlandi: o'lchovda 2 bilan farqi ajratib bo'lmaydigan darajada kichik (0.7 pp
 * BIAS, 0.6 pp tarqoqlik — 13 oyna buni hal qilmaydi), lekin 2 oyna bitta anomal
 * haftaga (bayram, katta aksiya) yarim vaznda bog'lanib qolardi. Bu — o'lchov ikki
 * variantni teng ko'rsatganda qilingan MUHANDISLIK tanlovi, taxmin emas.
 */
export const KALIB_OYNA = 4;

/**
 * KVANTIL uchun xotira — BIAS'nikidan UZUN, va bu ataylab.
 *
 * Ikkalasi boshqa-boshqa narsa: BIAS — SILJIB turadigan joylashuv parametri (uzun
 * xotira orqada qoladi, o'lchandi), kvantil esa TAQSIMOT SHAKLI — unga namuna kerak.
 * `abc×band` kaliti ~30 bandga bo'linadi; 4 oyna bilan `B|1k+` (n = 11) yoki
 * `C|100-300` (n = 59) kabi bandlar `C_MIN_N` to'siqdan o'tolmay ota-kesimga tushadi —
 * ya'ni aynan eng katta yutuq kutilgan joyda kalibratsiya band darajasiga qaytadi.
 * Jonli natija: A sinf 86.5% (kengayuvchi xotirali o'lchovda 89.9% edi).
 *
 * 12 oyna: `SkuForecastAccuracy` 26 hafta saqlanadi, ya'ni oyna doim mavjud.
 */
export const KVANT_OYNA = 12;

/** Shrinkage: BIAS koeffitsienti kichik namunada 1 ga tortiladi. */
export const SHRINK_N = 2_000;

/**
 * Kvantil uchun MINIMAL namuna. Kesim shundan kam qator bilan o'rganilgan bo'lsa —
 * o'z qiymati ishlatilmaydi, ota-kesimga tushiladi.
 *
 * NEGA SHRINKAGE EMAS: kvantilni ota-kesim qiymatiga "tortish" o'lchangan
 * yaxshilanishni BEKOR QILDI. `SHRINK_N = 2000` bilan `A|1k+` bandi (n = 143) o'z
 * signalining atigi 6.7% ini saqlab qolardi va natija band-darajali kalibratsiyaga
 * aylanib qolardi: jonli o'lchovda A sinf 85.1% → 83.2% (kutilgan 89.9% o'rniga).
 * O'lchov qanday o'tkazilgan bo'lsa — SHUNDAY qo'llanadi: `n ≥ 50` bo'lsa kesimning
 * O'Z kvantili, aks holda ota-kesim. O'rtacha bilan kvantil bir xil emas: o'rtachani
 * siqish uni barqarorlashtiradi, kvantilni siqish esa uning MA'NOSINI yo'qotadi.
 */
export const C_MIN_N = 50;

/** BIAS koeffitsienti chegaralari — kalibratsiya modelni buzib yubormasin. */
export const K_MIN = 0.75;
export const K_MAX = 1.35;

/**
 * √-masshtab koeffitsienti chegaralari (dona / √dona).
 *
 * `C_MAX` 20 dan 40 ga ko'tarildi: band kaliti kiritilgach `A|1k+` uchun HAQIQIY
 * o'rganilgan qiymat 18.7 chiqdi — eski chegara qonuniy qiymatlarni kesa boshlagan
 * edi. Chegara faqat "aqldan ozgan" qiymatga qarshi qorovul bo'lishi kerak, hisobni
 * belgilamasligi kerak. Katta seriyalarda bufer baribir `√(p50)` bilan cheklangan.
 */
export const C_MIN = 0;
export const C_MAX = 40;

/**
 * SOVUQ START qiymatlari — baho tarixi hali yo'q bo'lganda (yangi baza). Bular ham
 * o'lchangan (13-oyna rolling kalibratsiyasi), lekin tarix to'plangach DB'dan
 * hisoblangan qiymat ularni almashtiradi.
 */
export const C_SOVUQ: Record<Sinf, number> = {
  SMOOTH: 4.17,
  ERRATIC: 5.72,
  INTERMITTENT: 3.0,
  LUMPY: 8.4,
  KAM: 0, // KAM sinfda prognoz yozilmaydi
};

/** Masshtab: √(p50+1). Manfiy p50 to'siladi (qaytim) — aks holda NaN. */
export const masshtab = (p50: number) => Math.sqrt(Math.max(0, p50) + 1);

/** Kichik namunani 1 ga tortadi (`n` → og'irlik). */
export function siqilgan(k: number, n: number): number {
  const w = n / (n + SHRINK_N);
  return 1 + w * (k - 1);
}

export const qisqart = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * BIAS koeffitsienti: k = ΣF / ΣA. Prognoz k ga BO'LINADI.
 * k > 1 — model ko'p prognoz qilgan (bizdagi holat: 1.08).
 */
export function biasKoeff(sumForecast: number, sumActual: number, n: number): number {
  if (!(sumActual > 0) || !(sumForecast > 0)) return 1;
  return qisqart(siqilgan(sumForecast / sumActual, n), K_MIN, K_MAX);
}

/** Bitta sinf uchun kalibratsiya. */
export interface SinfKalib {
  /** √-masshtab kvantil koeffitsienti. */
  c: number;
  /** Nechta baho qatoridan o'rganildi (0 — sovuq start). */
  n: number;
}

/** ABC sinfi yo'q SKU uchun kalit (bo'sh satr emas — ko'rinadigan belgi). */
export const ABC_YOQ = "-";

/**
 * P50 KATTALIK BANDLARI — kvantil kalitining ikkinchi o'lchovi.
 *
 * NEGA KERAK: faqat sinf×ABC bo'yicha kalibrlanganda qoplash p50 kattaligi bo'ylab
 * MONOTON pasayadi (o'lchandi): 3–10 bandda 93.1%, 100–300 da 89.2%, 300–1k da 87.0%,
 * `1k+` da atigi **76.1%** — kamomad 344 dona/oyna. Ya'ni eng yirik seriyalar eng
 * yomon qoplanadi va yo'qotilgan sotuv aynan o'sha yerda to'planadi.
 *
 * Chegaralar logarifmik: talab taqsimoti ham shunday cho'ziladi, teng qadamli band
 * yuqori uchida bo'sh, pastida haddan tashqari zich bo'lardi.
 */
export const BANDLAR: readonly [number, string][] = [
  [0, "0"], [1, "0-1"], [3, "1-3"], [10, "3-10"], [30, "10-30"],
  [100, "30-100"], [300, "100-300"], [1000, "300-1k"], [Infinity, "1k+"],
];

export function bandNomi(p50: number): string {
  if (!(p50 > 0)) return "0";
  for (const [chek, nom] of BANDLAR) if (p50 <= chek) return nom;
  return "1k+";
}

/** SQL tomonda AYNI bandlarni qurish uchun CASE (ta'rif ikkiga bo'linmasin). */
export function bandCaseSQL(ustun: string): string {
  const shartlar = BANDLAR.filter(([c]) => Number.isFinite(c))
    .map(([chek, nom]) => `WHEN ${ustun} <= ${chek} THEN '${nom}'`)
    .join(" ");
  return `CASE WHEN NOT (${ustun} > 0) THEN '0' ${shartlar} ELSE '1k+' END`;
}

/** Kvantil kaliti: ABC × kattalik bandi. Sinf ATAYLAB yo'q — o'lchovda `sinf×abc×band`
 *  bilan `abc×band` teng chiqdi (A 89.9% ikkalasida), keyingisi esa soddaroq va
 *  bandiga ko'proq ma'lumot tushadi. */
export const kvantKalit = (abc: string | null, band: string) => `${abc || ABC_YOQ}|${band}`;

export interface Kalibratsiya {
  /** Global BIAS koeffitsienti (prognoz shunga BO'LINADI). */
  biasK: number;
  biasN: number;
  /** Kvantil koeffitsienti, kalit `abc|band` — ASOSIY daraja. */
  kvant: Map<string, SinfKalib>;
  /** Zaxira daraja: faqat band bo'yicha (ABC kesimida tarix yetmasa). */
  kvantBand: Map<string, SinfKalib>;
  /** Maqsad servis darajasi. */
  servis: number;
}

/** Sovuq start kalibratsiyasi — tarix yo'q. */
export function sovuqKalib(servis = SERVIS): Kalibratsiya {
  return { biasK: 1, biasN: 0, kvant: new Map(), kvantBand: new Map(), servis };
}

/**
 * Kvantil koeffitsienti: `abc|band` → `band` → sovuq start (sinf bo'yicha).
 *
 * KALIT IKKI O'LCHOVLI bo'lishi SHART — ikkalasi ham o'lchangan:
 *   • ABC'siz (faqat band): A 79.8% · C 95.7% — tengsiz, ya'ni ABC kerak.
 *   • Bandsiz (faqat sinf×abc): qoplash p50 bo'ylab siljiydi — 3–10 bandda 93.1%,
 *     `1k+` da 76.1%. Ya'ni band ham kerak.
 *   • `abc×band` √: JAMI 91.2% · A 89.9% · B 90.3% · C 91.0%, `1k+` 89.8%.
 * `sinf×abc×band` ham sinaldi — `abc×band` bilan TENG chiqdi (A ikkalasida 89.9%),
 * shuning uchun soddaroq kalit tanlandi (bandga ko'proq ma'lumot tushadi).
 */
export function cUchun(kal: Kalibratsiya, sinf: Sinf, abc: string | null, p50: number): number {
  const band = bandNomi(p50);
  return (
    kal.kvant.get(kvantKalit(abc, band))?.c ??
    kal.kvantBand.get(band)?.c ??
    C_SOVUQ[sinf] ?? // sovuq start — tarix yig'ilgunicha sinf bo'yicha
    0
  );
}

/**
 * Kalibrlangan prognoz. `raw` — modelning xom chiqishi.
 * Tartib MUHIM: avval BIAS tuzatiladi, keyin kvantil buferi qo'shiladi — bufer
 * tuzatilgan p50 ustiga qo'yilishi kerak, aks holda ikki tuzatish bir-birini yeydi.
 */
export function kalibrla(
  raw: number,
  sinf: Sinf,
  abc: string | null,
  kal: Kalibratsiya
): { p50: number; q90: number } {
  const p50 = Math.max(0, raw / kal.biasK);
  // Band TUZATILGAN p50 dan olinadi — bufer ham aynan shu qiymat ustiga qo'yiladi.
  const c = cUchun(kal, sinf, abc, p50);
  return { p50, q90: Math.max(p50, p50 + c * masshtab(p50)) };
}
