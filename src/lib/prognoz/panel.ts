/**
 * HAFTALIK PANEL — prognoz va sifat o'lchovining YAGONA ma'lumot manbasi.
 *
 * Har qanday prognoz/backtest so'rovi shu SQL'dan boshlanadi. Agar panel bir necha
 * faylda takrorlansa, birida promo/stockout filtri bo'lib boshqasida bo'lmaydi va
 * raqamlar bir-biriga mos kelmaydi — shuning uchun bu YAGONA joy.
 *
 * IKKI KRITIK QOIDA (ikkalasi ham jonli bazada o'lchangan):
 *
 * 1. `ProductSales` TO'LIQ SNAPSHOT EMAS — u sotuv-hodisa jadvali. Kuniga ~5 800 qator
 *    bor, holbuki SKU×filial juftliklari 49 122 ta. Ya'ni NOLLAR YOZILMAYDI: "sotuv
 *    bo'lmagan hafta" qator YO'QLIGI bilan bildiriladi. Nol-to'ldirmasdan o'rtacha
 *    sun'iy YUQORI chiqadi va butun prognoz yuqoriga qiyshayadi. Shu sababdan
 *    `ser CROSS JOIN wks` — panel zichlashtiriladi.
 *
 * 2. Faqat TO'LIQ (7 kunlik) haftalar. Chala chetlar (birinchi va joriy hafta) summani
 *    sun'iy pasaytiradi va modelni "talab tushdi" deb aldaydi.
 *
 * STOCKOUT haqida: qator YO'Q bo'lsa qoldiq BILINMAYDI — uni stockout deb belgilash
 * TAQIQLANADI (`min_stock IS NOT NULL` sharti shu uchun). Filial darajasida kunlik
 * qoldiq tarixi yo'q (`WarehouseStock` faqat markaziy ombor).
 */

/** Zichlashtirilgan haftalik panel: seriya (SKU×filial) × to'liq hafta. */
export const WEEKLY_PANEL_SQL = /* sql */ `
WITH wkall AS (
  SELECT date_trunc('week', "periodStart")::date w, count(DISTINCT "periodStart")::int days
  FROM "ProductSales" GROUP BY 1
), wks AS (
  -- Faqat 7 kunlik haftalar; "i" — ketma-ket tartib raqami (backtest origin'lari uchun)
  SELECT w, row_number() OVER (ORDER BY w)::int i FROM wkall WHERE days = 7
), raw AS (
  SELECT ps."productId" pid, ps."branchId" bid,
         date_trunc('week', ps."periodStart")::date w,
         SUM(COALESCE(ps."soldQty", 0))::float8 qty,
         SUM(ps.amount)::float8                 amt,
         MIN(ps."stockQty")::float8             min_stock
  FROM "ProductSales" ps
  WHERE date_trunc('week', ps."periodStart")::date IN (SELECT w FROM wks)
  GROUP BY 1, 2, 3
), ser AS (
  -- "Faol seriya": oynada kamida bitta haqiqiy sotuv bo'lgan SKU×filial.
  -- unit_price — so'mli og'irlik uchun (dona narxi ≈ savdo / dona).
  SELECT pid, bid, SUM(amt) / NULLIF(SUM(qty), 0) unit_price
  FROM raw GROUP BY 1, 2 HAVING SUM(qty) > 0
)
SELECT s.pid, s.bid, k.i, k.w, s.unit_price,
       COALESCE(r.qty, 0)::float8 qty,
       COALESCE(r.amt, 0)::float8 amt,
       (r.pid IS NULL) had_no_row,
       -- Qator BOR va qoldiq ≤ 0 → stockout. Qator yo'q bo'lsa qoldiq bilinmaydi.
       (r.min_stock IS NOT NULL AND r.min_stock <= 0) stockout
FROM ser s
CROSS JOIN wks k
LEFT JOIN raw r ON r.pid = s.pid AND r.bid = s.bid AND r.w = k.w
`;

/** Panel qatori (bitta seriya × bitta hafta). */
export interface PanelCell {
  pid: number;
  bid: number;
  /** Hafta tartib raqami (1..N) — backtest origin'i shu bo'yicha kesiladi. */
  i: number;
  w: Date | string;
  unit_price: number | null;
  qty: number;
  amt: number;
  had_no_row: boolean;
  stockout: boolean;
}

/** Bitta seriya: haftalar bo'yicha tartiblangan qiymatlar. */
export interface Seriya {
  pid: number;
  bid: number;
  unitPrice: number;
  /** `qty[i]` — i-hafta sotuvi (nol-to'ldirilgan, indeks 0 dan). */
  qty: number[];
  stockout: boolean[];
  hadNoRow: boolean[];
}

/** Panel kataklarini seriyalarga guruhlaydi (haftalar tartibi saqlanadi). */
export function seriyalarga(cells: PanelCell[]): Seriya[] {
  const maxI = cells.reduce((m, c) => Math.max(m, c.i), 0);
  const map = new Map<string, Seriya>();

  for (const c of cells) {
    const key = `${c.pid}:${c.bid}`;
    let s = map.get(key);
    if (!s) {
      s = {
        pid: c.pid,
        bid: c.bid,
        unitPrice: Number(c.unit_price) || 0,
        qty: new Array<number>(maxI).fill(0),
        stockout: new Array<boolean>(maxI).fill(false),
        hadNoRow: new Array<boolean>(maxI).fill(false),
      };
      map.set(key, s);
    }
    s.qty[c.i - 1] = Number(c.qty) || 0;
    s.stockout[c.i - 1] = !!c.stockout;
    s.hadNoRow[c.i - 1] = !!c.had_no_row;
  }
  return [...map.values()];
}

/** Syntetos-Boylan chegaralari (1994/2005) — haftalik seriya uchun. */
export const ADI_CHEGARA = 1.32;
export const CV2_CHEGARA = 0.49;
/** Model qurish uchun minimal nolmas hafta soni (bundan kam — "tarix yetarli emas"). */
export const MIN_NOLMAS_HAFTA = 4;

export type Sinf = "SMOOTH" | "ERRATIC" | "INTERMITTENT" | "LUMPY" | "KAM";

/**
 * Seriyani sinflaydi (train oynasi bo'yicha). Sinf modelni EMAS, UI'ni belgilaydi:
 * LUMPY/INTERMITTENT'da haftalik grafik ma'nosiz (haftalarning ko'pi nol), shuning
 * uchun faqat gorizont jamisi ko'rsatiladi.
 */
export function sinfla(train: number[]): { sinf: Sinf; nz: number; adi: number | null; cv2: number | null } {
  const nolmas = train.filter((v) => v > 0);
  const nz = nolmas.length;
  if (nz < MIN_NOLMAS_HAFTA) return { sinf: "KAM", nz, adi: null, cv2: null };

  const adi = train.length / nz;
  const ort = nolmas.reduce((s, v) => s + v, 0) / nz;
  const variansa = nolmas.reduce((s, v) => s + (v - ort) ** 2, 0) / nz;
  const cv2 = ort > 0 ? variansa / ort ** 2 : null;

  const siyrak = adi >= ADI_CHEGARA;
  const notekis = cv2 != null && cv2 >= CV2_CHEGARA;
  if (siyrak) return { sinf: notekis ? "LUMPY" : "INTERMITTENT", nz, adi, cv2 };
  return { sinf: notekis ? "ERRATIC" : "SMOOTH", nz, adi, cv2 };
}
