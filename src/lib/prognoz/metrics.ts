/**
 * Prognoz sifati metrikalari.
 *
 * ASOSIY ARXITEKTURA QOIDASI: yig'indilar to'planadi, NISBATLAR HECH QACHON qo'shilmaydi.
 * WAPE/BIAS/FVA har qanday kesimda (filial, kategoriya, ABC, ta'minotchi) `add()` bilan
 * birlashtirilgan yig'indilardan qayta hisoblanadi. Aks holda "seriya bo'yicha o'rtacha
 * WAPE" va "agregat WAPE" bir-biriga mos kelmaydi va hisobot ikki xil raqam ko'rsatadi.
 *
 * MAPE ATAYLAB YO'Q. MAPE = AVG(|A−F| / A) — fakt 0 bo'lsa nolga bo'linish, bizda esa
 * kataklarning ~70%ida A = 0 (o'lchangan). "Nolni 1 ga almashtirish" yoki sMAPE bilan
 * qutqarish ma'nosiz raqam beradi va biznes unga ishonib qoladi. Shuning uchun
 * skrinshotdagi "MAPE / Bias" sarlavhasi bizda "WAPE / Bias" bo'ladi.
 *
 * MASE ham asosiy metrika emas (faqat diagnostika): uning optimumi MEDIAN, lumpy
 * seriyada median = 0, ya'ni "har doim 0 deb aytish" eng yaxshi model bo'lib chiqadi.
 */

/** Xato akkumulyatori — faqat yig'indilar. */
export interface ErrAcc {
  n: number; // kataklar soni
  posWeeks: number; // fakt > 0 bo'lgan kataklar
  actual: number; // ΣA
  forecast: number; // ΣF
  absErr: number; // Σ|A−F|
  sqErr: number; // Σ(A−F)²
  baseAbsErr: number; // AYNI oynadagi naive1 xatosi — FVA maxraji
  baseSqErr: number;
  amountWeight: number; // seriyaning so'mli og'irligi (fakt × dona narxi)
  /** RMSSE masshtabi: train'dagi (1/(n−1))·Σ(yₜ−yₜ₋₁)². Birlashtirishda YO'QOLADI. */
  scaleMse: number | null;
}

export const EMPTY: ErrAcc = {
  n: 0, posWeeks: 0, actual: 0, forecast: 0, absErr: 0, sqErr: 0,
  baseAbsErr: 0, baseSqErr: 0, amountWeight: 0, scaleMse: null,
};

/**
 * Yig'indilarni qo'shadi. `scaleMse` ATAYLAB `null` bo'ladi — u seriyaga xos masshtab,
 * uni birlashtirish RMSSE'ni ma'nosiz qiladi (RMSSE faqat seriya darajasida o'qiladi).
 */
export function add(a: ErrAcc, b: ErrAcc): ErrAcc {
  return {
    n: a.n + b.n,
    posWeeks: a.posWeeks + b.posWeeks,
    actual: a.actual + b.actual,
    forecast: a.forecast + b.forecast,
    absErr: a.absErr + b.absErr,
    sqErr: a.sqErr + b.sqErr,
    baseAbsErr: a.baseAbsErr + b.baseAbsErr,
    baseSqErr: a.baseSqErr + b.baseSqErr,
    amountWeight: a.amountWeight + b.amountWeight,
    scaleMse: null,
  };
}

/** WAPE = Σ|A−F| / ΣA. Asosiy metrika. `null` — fakt yo'q (o'lchab bo'lmaydi). */
export const wape = (a: ErrAcc): number | null => (a.actual > 0 ? a.absErr / a.actual : null);

/** UI'da ko'rsatiladigan "Aniqlik" = 1 − WAPE (manfiy bo'lishi mumkin — bu ham ma'lumot). */
export const accuracy = (a: ErrAcc): number | null => {
  const w = wape(a);
  return w === null ? null : 1 - w;
};

/** BIAS = Σ(F−A) / ΣA. Ishorasi bilan: musbat — tizimli ko'p, manfiy — tizimli kam. */
export const bias = (a: ErrAcc): number | null =>
  a.actual > 0 ? (a.forecast - a.actual) / a.actual : null;

/** RMSSE (M5 standarti) — faqat seriya darajasida, `scaleMse` mavjud bo'lganda. */
export const rmsse = (a: ErrAcc): number | null =>
  a.scaleMse && a.scaleMse > 0 && a.n > 0 ? Math.sqrt(a.sqErr / a.n / a.scaleMse) : null;

/**
 * FVA (Forecast Value Added) — model naive baseline'dan qanchalik yaxshi.
 * `fvaRel` — nisbiy (UI'da shu ko'rsatiladi): 1 − Σ|A−F| / Σ|A−F_naive|.
 * MANFIY qiymat = model naive'dan YOMON. Bu holat yashirilmaydi.
 */
export const fvaRel = (a: ErrAcc): number | null =>
  a.baseAbsErr > 0 ? 1 - a.absErr / a.baseAbsErr : null;

/** FVA foiz-punktda: (Σ|A−F_naive| − Σ|A−F|) / ΣA — WAPE necha punktga yaxshilandi. */
export const fvaPp = (a: ErrAcc): number | null =>
  a.actual > 0 ? (a.baseAbsErr - a.absErr) / a.actual : null;

/** Naive baseline WAPE — taqqoslash uchun. */
export const baseWape = (a: ErrAcc): number | null =>
  a.actual > 0 ? a.baseAbsErr / a.actual : null;

/**
 * Bitta katakni baholaydi. Model VA baseline AYNI joyda hisoblanadi — bu ataylab:
 * eng ko'p uchraydigan soxtalashtirish baseline'ni "noqulay" qilib qo'yish (masalan
 * modelni stockout chiqarilgan holda, baseline'ni hammasida hisoblash).
 */
export function scoreCell(
  actual: number,
  model: number,
  naive: number,
  unitPrice: number
): ErrAcc {
  return {
    n: 1,
    posWeeks: actual > 0 ? 1 : 0,
    actual,
    forecast: model,
    absErr: Math.abs(actual - model),
    sqErr: (actual - model) ** 2,
    baseAbsErr: Math.abs(actual - naive),
    baseSqErr: (actual - naive) ** 2,
    amountWeight: actual * unitPrice,
    scaleMse: null,
  };
}

/** So'm-og'irlikli WAPE: har seriya so'mli hissasiga proportsional. */
export function wapeSomli(acc: ErrAcc[]): number | null {
  let num = 0;
  let den = 0;
  for (const a of acc) {
    const w = wape(a);
    if (w === null) continue;
    num += w * a.amountWeight;
    den += a.amountWeight;
  }
  return den > 0 ? num / den : null;
}
