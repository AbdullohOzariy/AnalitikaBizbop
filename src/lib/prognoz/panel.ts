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

/**
 * Hafta lug'ati — panel va hafta ro'yxati AYNI ta'rifdan chiqishi uchun ajratilgan.
 * Ikki joyda takrorlansa, birida "7 kunlik" filtri o'zgarib boshqasida qolib ketardi va
 * `i` indeksi ikki xil ma'no olardi (backtest origin'i bilan prognoz origin'i siljiydi).
 */
export const WKS_CTE = /* sql */ `
wkall AS (
  SELECT date_trunc('week', "periodStart")::date w, count(DISTINCT "periodStart")::int days
  FROM "ProductSales" GROUP BY 1
), wks AS (
  -- Faqat 7 kunlik haftalar; "i" — ketma-ket tartib raqami (backtest origin'lari uchun)
  SELECT w, row_number() OVER (ORDER BY w)::int i FROM wkall WHERE days = 7
)`;

/**
 * To'liq haftalar ro'yxati (indeks → dushanba sanasi).
 * Sana ATAYLAB `::text` — `date` tipini drayver mahalliy yarim tunga aylantirib
 * qo'yishi mumkin (pg `parseDate`), natijada hafta bir kunga siljib prognoz oynasi
 * mos kelmay qoladi. Matn ko'rinishida noaniqlik yo'q.
 */
export const WEEKS_SQL = /* sql */ `WITH ${WKS_CTE} SELECT w::text w, i FROM wks ORDER BY i`;

/** Zichlashtirilgan haftalik panel: seriya (SKU×filial) × to'liq hafta. */
export const WEEKLY_PANEL_SQL = /* sql */ `
WITH ${WKS_CTE}, raw AS (
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

/**
 * SERIYA-DARAJALI o'qish — haftalik cron uchun. Panelni Postgres ichida massivga
 * yig'adi: katak-darajali `WEEKLY_PANEL_SQL` 1.3 mln qator qaytaradi (o'lchandi:
 * SQL ~4.5 s, lekin Node'ga uzatish 94 s), bu esa ~45 ming qator. Ta'rif AYNI —
 * ustidan `array_agg`, ya'ni panel qoidalari (nol-to'ldirish, faqat 7 kunlik hafta,
 * stockout sharti) bir joyda qoladi.
 */
export const WEEKLY_SERIES_SQL = /* sql */ `
WITH panel AS (${WEEKLY_PANEL_SQL})
SELECT pid, bid, unit_price,
       array_agg(qty ORDER BY i)        qty,
       array_agg(stockout ORDER BY i)   stockout,
       array_agg(had_no_row ORDER BY i) had_no_row
FROM panel
GROUP BY pid, bid, unit_price
`;

/**
 * BITTA seriyaning haftalik tarixi (UI grafigi uchun). Panel bilan AYNI qoidalar —
 * faqat to'liq haftalar, nol-to'ldirilgan, stockout sharti bir xil.
 *
 * NEGA ALOHIDA SO'ROV: to'liq panelni hisoblab keyin bitta seriyani filtrlash
 * 1.3 mln qatorlik CROSS JOIN'ni materializatsiya qiladi (~5 s har sahifa ochilganda).
 * Bu yerda filtr `raw` ichida — SKU×filial bo'yicha indeks ishlaydi.
 */
export const SERIYA_TARIX_SQL = /* sql */ `
WITH ${WKS_CTE}, raw AS (
  SELECT date_trunc('week', ps."periodStart")::date w,
         SUM(COALESCE(ps."soldQty", 0))::float8 qty,
         MIN(ps."stockQty")::float8 min_stock
  FROM "ProductSales" ps
  WHERE ps."productId" = $1 AND ps."branchId" = $2
  GROUP BY 1
)
SELECT k.w::text w, COALESCE(r.qty, 0)::float8 qty,
       (r.min_stock IS NOT NULL AND r.min_stock <= 0) stockout
FROM wks k LEFT JOIN raw r ON r.w = k.w
ORDER BY k.i
`;

/** `WEEKLY_SERIES_SQL` qatori (massivlar hafta tartibida). */
export interface SeriyaRow {
  pid: number;
  bid: number;
  unit_price: number | null;
  qty: number[];
  stockout: boolean[];
  had_no_row: boolean[];
}

/** SQL massiv shaklini `Seriya` ga o'giradi. */
export function seriyalarQatordan(rows: SeriyaRow[]): Seriya[] {
  return rows.map((r) => ({
    pid: Number(r.pid),
    bid: Number(r.bid),
    unitPrice: Number(r.unit_price) || 0,
    qty: r.qty.map((v) => Number(v) || 0),
    stockout: r.stockout.map(Boolean),
    hadNoRow: r.had_no_row.map(Boolean),
  }));
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
