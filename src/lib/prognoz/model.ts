/**
 * PROGNOZ MODELLARI — barchasi bitta joyda, bitta imzo bilan.
 *
 * Baseline va model AYNI funksiya oilasidan chiqishi shart, aks holda taqqoslash
 * (FVA) soxta bo'ladi. Har model: train seriyasi + gorizont → gorizont JAMISI.
 *
 * NEGA GORIZONT JAMISI, haftalik nuqta emas: o'lchandi (rolling origin, 3 oyna,
 * so'm-og'irlikli WAPE) — haftalik nuqtada FVA ≈ 0 (model naive'dan yaxshi emas),
 * 4 haftalik jamida esa siyrak sinfda WAPE 79.2% → 73.7%, tez sinfda 47.0% → 40.1%.
 * Zakaz qarori ham aynan gorizont jamisiga tayanadi ("keyingi 4 haftaga qancha").
 */

export type ModelKey = "naive1" | "ma4" | "ma8" | "combo50";

/**
 * MANFIY PROGNOZ BO'LMAYDI — barcha model funksiyalari shu to'siqdan o'tadi.
 *
 * `ProductSales.soldQty` MANFIY bo'lishi mumkin (qaytim sotuvdan ko'p bo'lgan hafta):
 * jonli bazada 418 549 seriya-haftadan 40 tasi manfiy, eng kichigi p50 = −12 885.
 * To'sib qo'yilmasa bu qiymatlar oqib ketadi va `√(p50+1)` kabi har qanday masshtab
 * hisobi NaN beradi — o'lchovda AYNAN shu yuz berdi va butun sinf qatorini buzdi.
 * Qaytim tarixning o'zida QOLADI (u haqiqiy ma'lumot), faqat CHIQISH nolda to'xtaydi.
 */
const nolgaTushir = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/** Oxirgi to'liq hafta fakti × gorizont. Skrinshotdagi "повтор последней недели". */
export function naive1(train: number[], h: number): number {
  const last = train.length > 0 ? train[train.length - 1] : 0;
  return nolgaTushir(last * h);
}

/** Oxirgi `k` haftaning o'rtachasi × gorizont. */
export function movingAvg(train: number[], h: number, k: number): number {
  if (train.length === 0) return 0;
  const oyna = train.slice(-k);
  const ort = oyna.reduce((s, v) => s + v, 0) / oyna.length;
  return nolgaTushir(ort * h);
}

/**
 * Yagona POZITIV FVA bergan model: 0.5·(oxirgi hafta) + 0.5·MA4.
 *
 * Vazn 0.5 QATTIQ yozilgan va sozlamaga chiqarilmaydi. O'lchovda w=0.6 bir oz yaxshiroq
 * chiqdi (+5.4% vs +4.8%), lekin bu 3 kesishgan origin'dagi farq — uni tanlash
 * overfitting bo'lardi. Sozlanadigan vazn esa har kim o'z raqamini qo'yib, FVA'ni
 * bilmasdan buzishiga olib keladi.
 */
export const COMBO_W = 0.5;

export function combo50(train: number[], h: number): number {
  return COMBO_W * naive1(train, h) + (1 - COMBO_W) * movingAvg(train, h, 4);
}

/** Model kaliti bo'yicha prognoz (gorizont jamisi, dona). */
export function forecast(key: ModelKey, train: number[], h: number): number {
  switch (key) {
    case "naive1":
      return naive1(train, h);
    case "ma4":
      return movingAvg(train, h, 4);
    case "ma8":
      return movingAvg(train, h, 8);
    case "combo50":
      return combo50(train, h);
  }
}

/** FVA darvozasi: model naive'dan kamida shuncha (nisbiy) yaxshi bo'lishi shart. */
export const FVA_GATE = 0.02;

/**
 * SINF BO'YICHA MODEL TANLOVI — Faza 1 da jonli bazada o'lchangan FVA (h=4):
 *   ERRATIC +8.8% · INTERMITTENT +7.7% · SMOOTH +3.6% → darvoza O'TDI → combo50
 *   LUMPY   +0.9% → darvoza O'TMADI → naive1 (shovqinga murakkablik qo'shmaymiz)
 *
 * Bu sozlama EMAS: o'lchov natijasi. Backtest qayta yuritilib raqam o'zgarsa —
 * shu funksiya o'zgaradi, kod bilan birga sabab ham ko'rinib turadi.
 */
export function modelniTanla(sinf: "SMOOTH" | "ERRATIC" | "INTERMITTENT" | "LUMPY" | "KAM"): ModelKey {
  return sinf === "LUMPY" || sinf === "KAM" ? "naive1" : "combo50";
}

/**
 * RMSSE masshtabi: train'dagi qo'shni haftalar farqining kvadratik o'rtachasi
 * (M5 standarti). `null` — train juda qisqa yoki seriya butunlay o'zgarmas.
 */
export function scaleMse(train: number[]): number | null {
  if (train.length < 2) return null;
  let s = 0;
  for (let t = 1; t < train.length; t++) s += (train[t] - train[t - 1]) ** 2;
  const v = s / (train.length - 1);
  return v > 0 ? v : null;
}

/**
 * q90 (servis darajasi) = P50 + z · σ · √h.
 *
 * σ — train'dagi haftalik standart chetlanish. `z` ATAYLAB parametr: uni backtest'da
 * qoplash 90% bo'ladigan qilib empirik kalibrlash kerak (Faza 3). Normal taqsimotning
 * 1.2816 qiymatini qattiq yozish xato bo'lardi — o'lchovda haqiqiy qoplash 87–89%
 * chiqdi, ya'ni z biroz kattaroq bo'lishi kerak.
 *
 * NEGA q90, P50 EMAS: zakaz qarorida kam-zaxira narxi ortiqcha-zaxiradan qimmat
 * (sotuv yo'qoladi, mijoz ketadi). P10 esa UMUMAN ishlatilmaydi — o'lchovda uning
 * qoplashi 28–73% chiqdi (maqsad 10%), ya'ni mutlaqo kalibrsiz.
 *
 * ⚠️ ZAKAZGA ULANMASIN (Faza 3 gacha): jonli bazada q90/p50 nisbati o'lchandi —
 * SMOOTH 2.6× · INTERMITTENT 2.5× · ERRATIC 5.2×. Ya'ni normal taqsimot formulasi
 * siyrak/notekis talabda q90'ni bir necha barobar shishiradi (taqsimot qiyshiq,
 * σ esa cho'qqilardan katta chiqadi). Bu yerda kerak bo'lgan narsa — EMPIRIK
 * kvantil (backtest xatolar taqsimotidan), formula emas.
 */
export function q90(p50: number, train: number[], h: number, z: number): number {
  if (train.length < 2) return nolgaTushir(p50);
  const ort = train.reduce((s, v) => s + v, 0) / train.length;
  const variansa = train.reduce((s, v) => s + (v - ort) ** 2, 0) / (train.length - 1);
  const sigma = Math.sqrt(Math.max(0, variansa));
  return nolgaTushir(p50 + z * sigma * Math.sqrt(h));
}

/** Gorizont ichida nol bo'lish ehtimoli (LUMPY sinfda P50 o'rniga ko'rsatiladi). */
export function nolEhtimoli(train: number[]): number | null {
  if (train.length === 0) return null;
  const nollar = train.filter((v) => v <= 0).length;
  return nollar / train.length;
}
