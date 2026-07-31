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
 *    shuning uchun qoldiq √(p50+1) ga normalizatsiya qilinadi. To'rt qoida o'lchandi
 *    (qoplash / ortiqcha dona / kamomad dona, seriya-oynasiga):
 *      formula (p50+z·σ·√h)   84.5% · 22.8 · 2.8   ← maqsad 90% edi, YETMAYDI
 *      multiplikativ (m·p50)  84.6% · 56.6 · 2.2   ← LUMPY'da 74.9% (p50=0 qoplanmaydi)
 *      additiv (p50+a)        90.6% · 17.8 · 4.5
 *      √-masshtab             90.7% · 20.9 · 3.7   ← g'olib
 *    √-masshtab har sinfda 90% ga tegadi (SMOOTH 89.8 · ERRATIC 90.5 · INTERMITTENT
 *    90.8 · LUMPY 91.0) va savdo to'plangan sinflarda additivdan kam kamomad beradi
 *    (SMOOTH: 9.7 vs 11.8 dona) — SMOOTH seriyalar savdoning 52.5%i.
 *
 * MUHIM CHEKLOV: multiplikativ qoida INTERMITTENT/LUMPY'da PRINSIPIAL ishlamaydi —
 * bu sinflarda p50 = 0 bo'lgan oynalar 29% va 56%, `m · 0 = 0` esa hech qachon
 * qoplamaydi. Shu sabab qoida ADDITIV shaklda (p50 + c·√(p50+1)) qurilgan.
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

/** Shrinkage: namuna kichik bo'lsa tuzatishni 1 ga tortadi. */
export const SHRINK_N = 2_000;

/** BIAS koeffitsienti chegaralari — kalibratsiya modelni buzib yubormasin. */
export const K_MIN = 0.75;
export const K_MAX = 1.35;

/** √-masshtab koeffitsienti chegaralari (dona / √dona). */
export const C_MIN = 0;
export const C_MAX = 20;

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

export const kvantKalit = (sinf: Sinf, abc: string | null) => `${sinf}|${abc || ABC_YOQ}`;

export interface Kalibratsiya {
  /** Global BIAS koeffitsienti (prognoz shunga BO'LINADI). */
  biasK: number;
  biasN: number;
  /** Kvantil koeffitsienti, kalit `sinf|abc` — ASOSIY daraja. */
  kvant: Map<string, SinfKalib>;
  /** Zaxira daraja: faqat sinf bo'yicha (abc kesimida tarix yetmasa). */
  kvantSinf: Map<Sinf, SinfKalib>;
  /** Maqsad servis darajasi. */
  servis: number;
}

/** Sovuq start kalibratsiyasi — tarix yo'q. */
export function sovuqKalib(servis = SERVIS): Kalibratsiya {
  const kvantSinf = new Map<Sinf, SinfKalib>();
  for (const [k, c] of Object.entries(C_SOVUQ)) kvantSinf.set(k as Sinf, { c, n: 0 });
  return { biasK: 1, biasN: 0, kvant: new Map(), kvantSinf, servis };
}

/**
 * Kvantil koeffitsientini PRIOR ga tortadi (namuna kichik bo'lsa). Kvantil
 * o'rtachadan shovqinliroq — 200 qatorli kesimda 90-protsentil bitta cho'qqiga
 * ilinib qolishi mumkin.
 *
 * PRIOR IYERARXIK bo'lishi SHART: sinf×ABC bandi uchun prior — o'sha sinfning
 * O'RGANILGAN qiymati, sovuq-start konstantasi EMAS. Konstantaga tortilganda A sinf
 * (unga eng katta bufer kerak) sinf o'rtachasiga qarab pasayib ketadi va servis
 * darajasi ABC bo'ylab tengsiz qoladi (o'lchandi: A 85.0% / C 92.5%).
 */
export function siqilganC(c: number, prior: number, n: number): number {
  const w = n / (n + SHRINK_N);
  return qisqart(prior + w * (c - prior), C_MIN, C_MAX);
}

/**
 * Kvantil koeffitsienti: `sinf|abc` → `sinf` → sovuq start.
 *
 * NEGA ABC KESIMI: faqat sinf bo'yicha kalibrlansa servis darajasi ABC bo'ylab
 * TENGSIZ taqsimlanadi — o'lchandi: A 79.0% · B 87.3% · C 95.2% (tarqoqlik 16.2 pp),
 * ya'ni eng ko'p sotiladigan tovarlar eng kam qoplanadi va yo'qotilgan sotuv aynan
 * o'sha yerda to'planadi (A: 18.8 dona/oyna, C: 0.4). `sinf×abc` bilan A 90.6% ·
 * B 90.4% · C 90.9% (tarqoqlik 0.5 pp). Hajm guruhi bo'yicha kalibrlash ISHLAMADI
 * (15.4 pp) — ABC joriy hajmda yo'q ma'lumotni (talab barqarorligini) tashiydi.
 */
export function cUchun(kal: Kalibratsiya, s: Sinf, abc: string | null): number {
  return kal.kvant.get(kvantKalit(s, abc))?.c ?? kal.kvantSinf.get(s)?.c ?? C_SOVUQ[s] ?? 0;
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
  const c = cUchun(kal, sinf, abc);
  return { p50, q90: Math.max(p50, p50 + c * masshtab(p50)) };
}
