/**
 * PROGNOZ O'QISH QATLAMI — UI shu yerdan o'qiydi, jadvalga to'g'ridan-to'g'ri emas.
 *
 * Sabab: "qaysi run", "ishonch belgisi qanday hisoblanadi", "qaysi kesim" degan
 * qoidalar bir joyda turishi kerak. Sahifalar ularni takrorlasa, ro'yxatdagi raqam
 * bilan sifat sahifasidagi raqam bir-biriga mos kelmay qoladi.
 *
 * ESLATMA: WAPE/BIAS/FVA hech qachon saqlanmaydi — yig'indilardan O'QISHDA
 * hisoblanadi (`metrics.ts` qoidasi).
 */
import { pgPool } from "@/lib/prisma";
import { ISHONCH_OYNA } from "./hisobla";
import { ishonchBelgisi, type Ishonch } from "./segment";
import type { Sinf } from "./panel";

export interface RunMeta {
  id: number;
  weekStart: string;
  horizon: number;
  biasK: number;
  servis: number;
  forecasted: number;
  panelWeeks: number;
  /** Prognoz oynasi: birinchi va oxirgi hafta (dushanba). */
  targetFrom: string;
  targetTo: string;
}

/** Eng so'nggi (joriy) prognoz yugurishi. `null` — hali hisoblanmagan. */
export async function oxirgiRun(): Promise<RunMeta | null> {
  const r = await pgPool.query<RunMeta>(`
    SELECT r.id, r."weekStart"::text "weekStart", r.horizon, r."biasK" "biasK",
           r.servis, r.forecasted, r."panelWeeks" "panelWeeks",
           (r."weekStart" + 7)::text "targetFrom",
           (r."weekStart" + 7 * r.horizon)::text "targetTo"
    FROM "SkuForecastRun" r
    WHERE r.status = 'ok' AND r.forecasted > 0
    ORDER BY r."weekStart" DESC LIMIT 1
  `);
  return r.rows[0] ?? null;
}

export interface PrognozQator {
  productId: number;
  code: number;
  name: string;
  branchId: number;
  branch: string;
  kat: string | null;
  subkat: string | null;
  abc: string | null;
  sinf: Sinf;
  modelKey: string;
  /** O'tgan (oxirgi to'liq) hafta fakti — dona. */
  lastQty: number;
  /** Gorizont JAMISI (4 hafta), dona. */
  p50: number;
  /** Servis darajasi bo'yicha zaxira tavsiyasi, dona. */
  q90: number;
  /** Ayni oynadagi naive1 — "model nima qo'shdi" ni ko'rsatish uchun. */
  baseline: number;
  zeroProb: number | null;
  unitPrice: number;
  /** Prognozning so'mdagi og'irligi (p50 × dona narxi) — tartiblash uchun. */
  som: number;
  /** Oxirgi oynalar bo'yicha WAPE (null — hali baholanmagan). */
  wape: number | null;
  ishonch: Ishonch | null;
}

export interface PrognozFiltr {
  productId?: number;
  branchId?: number;
  /** Kategoriya YOKI subkategoriya id (ikkalasi ham qidiriladi). */
  katId?: number;
  abc?: string;
  sinf?: string;
  ishonch?: Ishonch;
  /** Nom yoki kod bo'yicha qidiruv. */
  q?: string;
  limit?: number;
}

/**
 * Ishonch belgisi uchun seriya-darajali WAPE (oxirgi `ISHONCH_OYNA` oyna).
 * `hisobla.ts` dagi bilan AYNI qoida — u yerda yozish uchun, bu yerda o'qish uchun.
 */
const ISHONCH_CTE = /* sql */ `
ish AS (
  SELECT pid, bid, SUM(ae) ae, SUM(a) a FROM (
    SELECT "productId" pid, "branchId" bid, "absErr" ae, actual a,
           row_number() OVER (PARTITION BY "productId", "branchId" ORDER BY "targetTo" DESC) rn
    FROM "SkuForecastAccuracy" WHERE stockout = false
  ) t WHERE rn <= ${ISHONCH_OYNA} GROUP BY 1, 2
)`;

/** Joriy prognoz ro'yxati. So'mli og'irlik bo'yicha kamayish tartibida. */
export async function prognozRoyxat(runId: number, f: PrognozFiltr = {}): Promise<PrognozQator[]> {
  const shart: string[] = [`f."runId" = $1`];
  const par: unknown[] = [runId];
  /** Parametr qo'shadi va uning `$n` o'rnini qaytaradi (SQL'ga qiymat YOZILMAYDI). */
  const p$ = (v: unknown) => {
    par.push(v);
    return `$${par.length}`;
  };
  if (f.productId) shart.push(`f."productId" = ${p$(f.productId)}`);
  if (f.branchId) shart.push(`f."branchId" = ${p$(f.branchId)}`);
  if (f.katId) {
    // Bitta parametr ikki joyda: kategoriya ham, subkategoriya ham mos kelsin
    const n = p$(f.katId);
    shart.push(`(p."categoryId" = ${n} OR cat."parentId" = ${n})`);
  }
  if (f.abc) shart.push(`p."abcClass" = ${p$(f.abc)}`);
  if (f.sinf) shart.push(`f.sinf = ${p$(f.sinf)}`);
  if (f.q) {
    const nom = p$(`%${f.q}%`);
    const kod = p$(f.q);
    shart.push(`(p.name ILIKE ${nom} OR p.code::text = ${kod})`);
  }

  const limit = Math.min(2000, Math.max(1, f.limit ?? 300));
  const rows = await pgPool.query<PrognozQator & { wape: number | null }>(
    `WITH ${ISHONCH_CTE}
     SELECT f."productId" "productId", p.code, p.name, f."branchId" "branchId", b.name branch,
            kat.name kat, cat.name subkat, p."abcClass" abc,
            f.sinf, f."modelKey" "modelKey", f."lastQty" "lastQty", f.p50, f.q90, f.baseline,
            f."zeroProb" "zeroProb", f."unitPrice" "unitPrice",
            (f.p50 * f."unitPrice")::float8 som,
            CASE WHEN i.a > 0 THEN (i.ae / i.a)::float8 END wape
     FROM "SkuForecast" f
     JOIN "Product" p ON p.id = f."productId"
     JOIN "Branch" b ON b.id = f."branchId"
     LEFT JOIN "Category" cat ON cat.id = p."categoryId"
     LEFT JOIN "Category" kat ON kat.id = cat."parentId"
     LEFT JOIN ish i ON i.pid = f."productId" AND i.bid = f."branchId"
     WHERE ${shart.join(" AND ")}
     ORDER BY som DESC NULLS LAST
     LIMIT ${limit}`,
    par
  );
  const natija = rows.rows.map((r) => ({ ...r, ishonch: ishonchBelgisi(r.wape) }));
  return f.ishonch ? natija.filter((r) => r.ishonch === f.ishonch) : natija;
}

/** Ro'yxat sarlavhasidagi jamlanma (filtrga mos JAMI — limit'dan mustaqil). */
export async function prognozJami(
  runId: number,
  f: PrognozFiltr = {}
): Promise<{ seriya: number; som: number; sku: number }> {
  const shart: string[] = [`f."runId" = $1`];
  const par: unknown[] = [runId];
  if (f.branchId) {
    par.push(f.branchId);
    shart.push(`f."branchId" = $${par.length}`);
  }
  if (f.abc) {
    par.push(f.abc);
    shart.push(`p."abcClass" = $${par.length}`);
  }
  if (f.sinf) {
    par.push(f.sinf);
    shart.push(`f.sinf = $${par.length}`);
  }
  const r = await pgPool.query<{ seriya: number; som: number; sku: number }>(
    `SELECT count(*)::int seriya, coalesce(sum(f.p50 * f."unitPrice"), 0)::float8 som,
            count(DISTINCT f."productId")::int sku
     FROM "SkuForecast" f JOIN "Product" p ON p.id = f."productId"
     WHERE ${shart.join(" AND ")}`,
    par
  );
  return r.rows[0] ?? { seriya: 0, som: 0, sku: 0 };
}

/** Bitta SKU: barcha filiallar bo'yicha joriy prognoz. */
export async function skuPrognoz(runId: number, productId: number): Promise<PrognozQator[]> {
  return prognozRoyxat(runId, { productId, limit: 50 });
}

export interface HaftaNuqta {
  hafta: string;
  qty: number;
  stockout: boolean;
}

/**
 * SKU×filial haftalik tarixi (grafik uchun). Panel bilan AYNI ta'rif —
 * faqat to'liq haftalar va nol-to'ldirilgan.
 */
export async function seriyaTarixi(productId: number, branchId: number): Promise<HaftaNuqta[]> {
  const { WEEKLY_PANEL_SQL } = await import("./panel");
  const r = await pgPool.query<{ w: string; qty: number; stockout: boolean }>(
    `SELECT w::text w, qty, stockout FROM (${WEEKLY_PANEL_SQL}) p
     WHERE pid = $1 AND bid = $2 ORDER BY i`,
    [productId, branchId]
  );
  return r.rows.map((x) => ({ hafta: x.w, qty: Number(x.qty) || 0, stockout: !!x.stockout }));
}

// ─── SIFAT SAHIFASI ────────────────────────────────────────────────────────────

export interface SifatQator {
  key: string;
  nom: string;
  seriya: number;
  n: number;
  /** Σ|A−F| / ΣA — asosiy metrika (MAPE ATAYLAB yo'q: kataklarning ~70%ida fakt 0). */
  wape: number | null;
  /** Ayni oynadagi naive1 WAPE — taqqoslash uchun. */
  baseWape: number | null;
  /** Model naive'dan qanchalik yaxshi (manfiy — yomonroq, yashirilmaydi). */
  fva: number | null;
  bias: number | null;
  /** q90 faktni qoplagan oynalar ulushi. */
  servis: number | null;
  /** Seriya-oynasiga o'rtacha ortiqcha zaxira / yo'qotilgan sotuv (dona). */
  ortiqcha: number;
  kamomad: number;
  ishonchli: number;
  taxminiy: number;
  ishonchsiz: number;
}

interface XomSegment {
  key: string;
  nom: string;
  seriya: number;
  n: number;
  actual: number;
  forecast: number;
  abserr: number;
  baseabserr: number;
  qopladi: number;
  ortiqcha: number;
  kamomad: number;
  ishonchli: number;
  taxminiy: number;
  ishonchsiz: number;
}

/** Yig'indilardan nisbatlarni HISOBLAYDI — saqlangan nisbat yo'q (metrics.ts qoidasi). */
function sifatla(r: XomSegment): SifatQator {
  const a = Number(r.actual);
  const ae = Number(r.abserr);
  const be = Number(r.baseabserr);
  const n = Number(r.n) || 0;
  return {
    key: r.key,
    nom: r.nom,
    seriya: Number(r.seriya),
    n,
    wape: a > 0 ? ae / a : null,
    baseWape: a > 0 ? be / a : null,
    fva: be > 0 ? 1 - ae / be : null,
    bias: a > 0 ? (Number(r.forecast) - a) / a : null,
    servis: n > 0 ? Number(r.qopladi) / n : null,
    ortiqcha: n > 0 ? Number(r.ortiqcha) / n : 0,
    kamomad: n > 0 ? Number(r.kamomad) / n : 0,
    ishonchli: Number(r.ishonchli),
    taxminiy: Number(r.taxminiy),
    ishonchsiz: Number(r.ishonchsiz),
  };
}

const SEG_USTUN = /* sql */ `
  sum(seriya)::int seriya, sum(n)::int n, sum(actual) actual, sum(forecast) forecast,
  sum("absErr") abserr, sum("baseAbsErr") baseabserr, sum(qopladi)::int qopladi,
  sum(ortiqcha) ortiqcha, sum(kamomad) kamomad, sum(ishonchli)::int ishonchli,
  sum(taxminiy)::int taxminiy, sum(ishonchsiz)::int ishonchsiz`;

/** Kesim bo'yicha sifat (barcha baholangan oynalar yig'indisi). */
export async function sifatKesim(scope: string, limit = 20): Promise<SifatQator[]> {
  const r = await pgPool.query<XomSegment>(
    `SELECT key, coalesce(label, key) nom, ${SEG_USTUN}
     FROM "SkuForecastSegment" WHERE scope = $1
     GROUP BY 1, 2 ORDER BY sum(actual) DESC LIMIT ${Math.min(100, limit)}`,
    [scope]
  );
  return r.rows.map(sifatla);
}

/** Oyna bo'yicha trend (origin sanasi bo'yicha, eng yangisi birinchi). */
export async function sifatTrend(limit = 12): Promise<SifatQator[]> {
  const r = await pgPool.query<XomSegment>(
    `SELECT r."weekStart"::text key, r."weekStart"::text nom,
            s.seriya, s.n, s.actual, s.forecast, s."absErr" abserr, s."baseAbsErr" baseabserr,
            s.qopladi, s.ortiqcha, s.kamomad, s.ishonchli, s.taxminiy, s.ishonchsiz
     FROM "SkuForecastSegment" s JOIN "SkuForecastRun" r ON r.id = s."runId"
     WHERE s.scope = 'ALL' ORDER BY r."weekStart" DESC LIMIT ${Math.min(52, limit)}`
  );
  return r.rows.map(sifatla);
}

export interface SifatMeta {
  runs: number;
  baholangan: number;
  birinchi: string | null;
  oxirgi: string | null;
  biasK: number | null;
  servis: number | null;
}

export async function sifatMeta(): Promise<SifatMeta> {
  const r = await pgPool.query<SifatMeta>(`
    SELECT count(*)::int runs,
           count(*) FILTER (WHERE "scoredAt" IS NOT NULL)::int baholangan,
           min("weekStart")::text birinchi, max("weekStart")::text oxirgi,
           (SELECT "biasK" FROM "SkuForecastRun" ORDER BY "weekStart" DESC LIMIT 1) "biasK",
           (SELECT servis FROM "SkuForecastRun" ORDER BY "weekStart" DESC LIMIT 1) servis
    FROM "SkuForecastRun"`);
  return r.rows[0] ?? { runs: 0, baholangan: 0, birinchi: null, oxirgi: null, biasK: null, servis: null };
}

/** SKU×filial bo'yicha o'tgan baholar (prognoz vs fakt). */
export interface BahoTarix {
  targetTo: string;
  actual: number;
  forecast: number;
  baseline: number;
  q90: number;
  stockout: boolean;
}

export async function bahoTarixi(productId: number, branchId: number): Promise<BahoTarix[]> {
  const r = await pgPool.query<BahoTarix>(
    `SELECT "targetTo"::text "targetTo", actual, forecast, baseline, q90, stockout
     FROM "SkuForecastAccuracy"
     WHERE "productId" = $1 AND "branchId" = $2
     ORDER BY "targetTo" DESC LIMIT 12`,
    [productId, branchId]
  );
  return r.rows;
}
