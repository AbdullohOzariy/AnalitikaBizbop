/**
 * BACKTEST — rolling origin (expanding window).
 *
 * train = 1..o, test = o+1..o+h. Origin'lar: o = maxI−h, maxI−2h, maxI−3h — ular
 * kesishadi, lekin 29 to'liq hafta bilan mustaqil oyna olish imkonsiz. Kesishgan
 * oynalardan olingan FVA'ning ishonch intervali keng — natijani "aniq raqam" deb emas,
 * "kattalik tartibi" deb o'qish kerak.
 *
 * GORIZONT: faqat 4 hafta validatsiya qilinadi (3 oyna sig'adi). 8 hafta — bitta oyna,
 * 12 hafta — umuman sig'maydi. Shuning uchun UI'da "Validatsiyalangan gorizont: 4 hafta"
 * yoziladi, skrinshotdagi "Горизонт = 12 нед" emas.
 */
import { seriyalarga, sinfla, type PanelCell, type Sinf } from "./panel";
import { forecast, naive1, scaleMse, type ModelKey } from "./model";
import { add, scoreCell, EMPTY, type ErrAcc } from "./metrics";

/** Minimal train uzunligi (bir chorak) — bundan qisqa oynada o'lchov ma'nosiz. */
export const MIN_TRAIN = 13;

export interface BacktestNatija {
  /** model → gorizont → sinf → yig'indilar */
  byModel: Map<ModelKey, Map<number, Map<Sinf, ErrAcc>>>;
  /** Har model uchun jami (barcha sinf/gorizont). */
  jami: Map<ModelKey, ErrAcc>;
  origins: number[];
  seriyalar: number;
  kataklar: number;
  /** Sinf bo'yicha seriya soni va so'mli ulush. */
  sinfStat: Map<Sinf, { seriya: number; som: number }>;
}

function bosh(): Map<Sinf, ErrAcc> {
  return new Map<Sinf, ErrAcc>();
}

function qoshHar(m: Map<Sinf, ErrAcc>, sinf: Sinf, acc: ErrAcc): void {
  m.set(sinf, add(m.get(sinf) ?? EMPTY, acc));
}

/**
 * Backtest o'tkazadi. `cells` — WEEKLY_PANEL_SQL natijasi.
 * `stockoutChiqar` — qoldiq tugagan haftalarni testdan chiqarish (censored demand):
 * sotuv 0 bo'lgani talab yo'qligini bildirmaydi, tovar bo'lmagan bo'lishi mumkin.
 */
export function backtest(
  cells: PanelCell[],
  opts?: { horizons?: number[]; models?: ModelKey[]; stockoutChiqar?: boolean }
): BacktestNatija {
  const horizons = opts?.horizons ?? [1, 4];
  const models = opts?.models ?? (["naive1", "ma4", "ma8", "combo50"] as ModelKey[]);
  const stockoutChiqar = opts?.stockoutChiqar ?? true;

  const seriyalar = seriyalarga(cells);
  const maxI = seriyalar[0]?.qty.length ?? 0;

  const byModel = new Map<ModelKey, Map<number, Map<Sinf, ErrAcc>>>();
  const jami = new Map<ModelKey, ErrAcc>();
  for (const m of models) {
    byModel.set(m, new Map(horizons.map((h) => [h, bosh()])));
    jami.set(m, EMPTY);
  }

  const sinfStat = new Map<Sinf, { seriya: number; som: number }>();
  const hMax = Math.max(...horizons);
  // Uch origin — kesishgan, lekin 29 hafta bilan boshqa imkoniyat yo'q
  const origins = [maxI - hMax, maxI - 2 * hMax, maxI - 3 * hMax].filter((o) => o >= MIN_TRAIN);

  let kataklar = 0;

  for (const s of seriyalar) {
    // Sinf oxirgi train oynasi bo'yicha (UI ham shu sinfni ko'rsatadi)
    const oxirgiTrain = s.qty.slice(0, Math.max(MIN_TRAIN, maxI - hMax));
    const { sinf } = sinfla(oxirgiTrain);
    const st = sinfStat.get(sinf) ?? { seriya: 0, som: 0 };
    st.seriya++;
    st.som += s.qty.reduce((a, v) => a + v, 0) * s.unitPrice;
    sinfStat.set(sinf, st);

    if (sinf === "KAM") continue; // model qurilmaydi — o'lchovga ham kirmaydi

    for (const o of origins) {
      const train = s.qty.slice(0, o);
      if (train.length < MIN_TRAIN) continue;
      const sc = scaleMse(train);

      for (const h of horizons) {
        const testSlice = s.qty.slice(o, o + h);
        if (testSlice.length < h) continue;
        // Censored demand: qoldiq tugagan hafta talabni ko'rsatmaydi
        if (stockoutChiqar && s.stockout.slice(o, o + h).some(Boolean)) continue;

        const actual = testSlice.reduce((a, v) => a + v, 0);
        const base = naive1(train, h);
        kataklar++;

        for (const m of models) {
          const f = forecast(m, train, h);
          const acc = { ...scoreCell(actual, f, base, s.unitPrice), scaleMse: sc };
          qoshHar(byModel.get(m)!.get(h)!, sinf, acc);
          jami.set(m, add(jami.get(m)!, acc));
        }
      }
    }
  }

  return { byModel, jami, origins, seriyalar: seriyalar.length, kataklar, sinfStat };
}
