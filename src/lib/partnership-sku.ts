/**
 * STRATEGIK HAMKORLIK — SKU darajasi (skorkartning uchinchi darajasi).
 *
 * Ta'minotchi → brend → SKU. Har SKU uchun tanlangan davr savdosi, OYLIK qator va
 * ikki taqqoslash: o'tgan oyga va o'tgan yilning ayni oyiga nisbatan o'zgarish.
 *
 * ⚠️ O'TGAN YIL HOZIRCHA BO'SH: sotuv tarixi 2026-01 dan boshlanadi (o'lchandi —
 * `ProductSales` eng erta sanasi 2025-12-31, ya'ni birinchi to'liq oy 2026-01).
 * Ustun ATAYLAB quriladi: ma'lumot yig'ilgach (2027 yanvardan) o'zi to'ladi va u
 * paytda kodni qayta yozish kerak bo'lmaydi. Bo'sh qiymat "—" bo'lib ko'rinadi,
 * NOL emas — nol "sotuv tushib ketdi" degan yolg'on xulosa berardi.
 *
 * Yuklash LAZY: qator yoyilganda so'raladi. Barcha ta'minotchi SKU'larini oldindan
 * yuklash — o'n minglab qator, skorkart ochilishini sekinlashtirardi.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/** Bitta oyning savdosi (oy — "YYYY-MM"). */
export type OyNuqta = { oy: string; savdo: number };

export type SkuQator = {
  productId: number;
  code: number;
  name: string;
  brandName: string | null;
  /** Tanlangan davr savdosi (proratsiya bilan). */
  savdo: number;
  /** Davr marjasi % (tannarx ma'lum qismidan). */
  marjaPct: number | null;
  /** Ta'minotchi (yoki brend) ichidagi ulush %. */
  ulushPct: number;
  /** Oylik qator — davr ichidagi to'liq oylar, o'sish tartibida. */
  oylar: OyNuqta[];
  /** Oxirgi oy savdosi (qator oxiri) va uning taqqoslashlari. */
  oxirgiOy: string | null;
  oxirgiOySavdo: number;
  /** Bir oldingi oy (davrdan tashqarida bo'lsa ham olinadi). */
  otganOySavdo: number | null;
  momPct: number | null;
  /** O'tgan yilning AYNI oyi. Tarix yetmasa — null (nol EMAS). */
  otganYilSavdo: number | null;
  yoyPct: number | null;
};

/**
 * TA'MINOTCHI (yoki brend) JAMISI — SKU qatorlari yig'indisi EMAS.
 *
 * Farqi muhim: `rows` eng katta 500 SKU bilan cheklangan (jadval klient tomonda
 * saralanadi), jami esa BARCHA SKU'dan hisoblanadi. Ikkalasini qo'shib chiqarish
 * "jami qatorlar yig'indisiga teng emas" degan savolni tug'dirardi.
 */
export type JamiOylik = {
  oylar: OyNuqta[];
  oxirgiOy: string | null;
  oxirgiOySavdo: number;
  otganOySavdo: number | null;
  momPct: number | null;
  otganYilSavdo: number | null;
  yoyPct: number | null;
};

export type SkuNatija = {
  supplierId: number;
  agentId: number | null;
  periodStart: string;
  periodEnd: string;
  rows: SkuQator[];
  /** Oylik qatordagi oylar (ustun sarlavhalari uchun). */
  oylar: string[];
  /** O'tgan yil ustuni uchun ma'lumot bormi (yo'q bo'lsa UI izoh ko'rsatadi). */
  yoyBor: boolean;
  /** Ta'minotchi/brend darajasidagi oylik dinamika (cheklovsiz, barcha SKU). */
  jami: JamiOylik;
};

const oyKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const oyQosh = (key: string, n: number): string => {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return oyKey(t);
};
const foiz = (cur: number, base: number | null): number | null =>
  base != null && base > 0 ? ((cur - base) / base) * 100 : null;

/**
 * SKU kesimi. `agentId` berilsa faqat o'sha brend, aks holda ta'minotchining hammasi.
 *
 * Oylik qator DAVRDAN TASHQARIGA ham chiqadi: taqqoslash uchun bir oldingi oy va
 * o'tgan yilning ayni oyi kerak. Shuning uchun so'rov oynasi kengaytirilgan, lekin
 * `savdo`/`marja` ustunlari FAQAT tanlangan davrdan hisoblanadi (proratsiya bilan).
 */
export async function supplierSkuBreakdown(opts: {
  supplierId: number;
  agentId?: number | null;
  periodStart: string;
  periodEnd: string;
  limit?: number;
}): Promise<SkuNatija> {
  const { supplierId, agentId = null, periodStart, periodEnd } = opts;
  const limit = Math.min(2000, Math.max(1, opts.limit ?? 500));
  const startDate = new Date(`${periodStart}T00:00:00.000Z`);
  const endDate = new Date(`${periodEnd}T00:00:00.000Z`);

  // Davr proratsiyasi — partnership.ts / analytics.ts bilan AYNI naqsh
  const frac = Prisma.sql`(
    (LEAST(ps."periodEnd", ${endDate}::date) - GREATEST(ps."periodStart", ${startDate}::date) + 1)::numeric
    / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0)::numeric
  )`;
  const agentSql = agentId == null ? Prisma.empty : Prisma.sql`AND p."agentId" = ${agentId}`;

  // Oylik qator uchun oyna: o'tgan yilning ayni oyidan davr oxirigacha
  const oyBosh = oyQosh(oyKey(startDate), -12);
  const oynaBosh = new Date(`${oyBosh}-01T00:00:00.000Z`);

  const [davr, oylik] = await Promise.all([
    // Davr agregatsiyasi (savdo + marja) — skorkart bilan bir xil ta'rif
    prisma.$queryRaw<{ pid: number; code: number; name: string; brand: string | null; savdo: number; sales: number; cost: number }[]>`
      SELECT p.id AS pid, p.code, p.name, a.name AS brand,
        COALESCE(SUM(ps."amount"::numeric * ${frac}), 0)::float8 AS savdo,
        COALESCE(SUM(COALESCE(ps."salePrice" * ps."soldQty", ps."amount")::numeric * ${frac}), 0)::float8 AS sales,
        COALESCE(SUM(COALESCE(ps."costPrice" * ps."soldQty", ps."costAmount", 0)::numeric * ${frac}), 0)::float8 AS cost
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      LEFT JOIN "Agent" a ON a.id = p."agentId"
      WHERE ps."periodStart" <= ${endDate}::date AND ps."periodEnd" >= ${startDate}::date
        AND p."supplierId" = ${supplierId}
        ${agentSql}
      GROUP BY p.id, p.code, p.name, a.name
      HAVING COALESCE(SUM(ps."amount"::numeric * ${frac}), 0) > 0
      ORDER BY savdo DESC
      LIMIT ${limit}
    `,
    // Oylik qator — KALENDAR oy bo'yicha (proratsiyasiz: oy ichidagi kunlar to'liq
    // hisobga olinadi, chunki bu ustun davr chegarasiga emas, oyga bog'liq)
    prisma.$queryRaw<{ pid: number; oy: string; savdo: number }[]>`
      SELECT ps."productId" AS pid,
        to_char(date_trunc('month', ps."periodStart"), 'YYYY-MM') AS oy,
        COALESCE(SUM(ps."amount"), 0)::float8 AS savdo
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      WHERE ps."periodStart" >= ${oynaBosh}::date AND ps."periodStart" <= ${endDate}::date
        AND p."supplierId" = ${supplierId}
        ${agentSql}
      GROUP BY 1, 2
    `,
  ]);

  // Oylik xarita: pid → oy → savdo
  const oyMap = new Map<number, Map<string, number>>();
  for (const r of oylik) {
    const pid = Number(r.pid);
    let m = oyMap.get(pid);
    if (!m) { m = new Map(); oyMap.set(pid, m); }
    m.set(r.oy, Number(r.savdo) || 0);
  }

  // Davr ichidagi oylar (qator ustunlari) — boshdan oxirgacha
  const oylar: string[] = [];
  for (let k = oyKey(startDate); k <= oyKey(endDate); k = oyQosh(k, 1)) oylar.push(k);
  const oxirgiOy = oylar[oylar.length - 1] ?? null;
  const oldingiOy = oxirgiOy ? oyQosh(oxirgiOy, -1) : null;
  const yilOldin = oxirgiOy ? oyQosh(oxirgiOy, -12) : null;

  const davrJami = davr.reduce((s, r) => s + Number(r.savdo), 0);
  let yoyBor = false;

  const rows: SkuQator[] = davr.map((r) => {
    const pid = Number(r.pid);
    const m = oyMap.get(pid);
    const savdo = Number(r.savdo) || 0;
    const sales = Number(r.sales) || 0;
    const cost = Number(r.cost) || 0;

    const oxirgiOySavdo = oxirgiOy ? (m?.get(oxirgiOy) ?? 0) : 0;
    // `undefined` (ma'lumot yo'q) va 0 (sotuv bo'lmagan) FARQLANADI — birinchisi "—".
    const otganOySavdo = oldingiOy ? (m?.get(oldingiOy) ?? null) : null;
    const otganYilSavdo = yilOldin ? (m?.get(yilOldin) ?? null) : null;
    if (otganYilSavdo != null) yoyBor = true;

    return {
      productId: pid,
      code: Number(r.code),
      name: r.name,
      brandName: r.brand,
      savdo,
      marjaPct: sales > 0 ? ((sales - cost) / sales) * 100 : null,
      ulushPct: davrJami > 0 ? (savdo / davrJami) * 100 : 0,
      oylar: oylar.map((oy) => ({ oy, savdo: m?.get(oy) ?? 0 })),
      oxirgiOy,
      oxirgiOySavdo,
      otganOySavdo,
      momPct: foiz(oxirgiOySavdo, otganOySavdo),
      otganYilSavdo,
      yoyPct: foiz(oxirgiOySavdo, otganYilSavdo),
    };
  });

  // JAMI — `oylik` so'rovining BARCHA qatoridan (limit qo'llanmagan), ya'ni
  // `rows` kesilgan bo'lsa ham ta'minotchi dinamikasi to'liq ko'rinadi.
  const jamiOy = new Map<string, number>();
  for (const r of oylik) jamiOy.set(r.oy, (jamiOy.get(r.oy) ?? 0) + (Number(r.savdo) || 0));
  const jOxirgi = oxirgiOy ? (jamiOy.get(oxirgiOy) ?? 0) : 0;
  const jOldingi = oldingiOy ? (jamiOy.get(oldingiOy) ?? null) : null;
  const jYil = yilOldin ? (jamiOy.get(yilOldin) ?? null) : null;
  if (jYil != null) yoyBor = true;

  const jami: JamiOylik = {
    oylar: oylar.map((oy) => ({ oy, savdo: jamiOy.get(oy) ?? 0 })),
    oxirgiOy,
    oxirgiOySavdo: jOxirgi,
    otganOySavdo: jOldingi,
    momPct: foiz(jOxirgi, jOldingi),
    otganYilSavdo: jYil,
    yoyPct: foiz(jOxirgi, jYil),
  };

  return { supplierId, agentId, periodStart, periodEnd, rows, oylar, yoyBor, jami };
}
