/**
 * MAKSIMAL ZAKAZ nazorati — zaxira kunlari (stockday) chegarasi.
 *
 * Mavjud `hisobMaxStock` (order-status.ts) TA'MINOT SIKLIDAN kelib chiqadi: zakaz
 * oralig'i + lead time + XYZ buferi, ya'ni "sikl uchun qancha kerak". Bu chegara esa
 * BIZNES QARORI: "qancha zaxiradan oshmaymiz" — muzlagan kapital va muddati o'tish
 * xavfini cheklaydi. Ikkisi bir-birini almashtirmaydi, birga ishlaydi.
 *
 * FORMULA `/stockday` hisoboti bilan AYNI (src/lib/snapshot-reports.ts:236-241):
 *     kunlik o'rtacha = davr sotuvi / kuzatilgan kunlar
 *     stockday        = qoldiq / kunlik o'rtacha
 * Zakaz uchun "natijaviy" stockday — kelgan tovar qo'shilgandan keyin:
 *     (qoldiq + zakaz miqdori) / kunlik o'rtacha
 * Ikki joyda ikki xil stockday bo'lishi eng yomon natija bo'lardi — shu izoh
 * ataylab shu yerda turadi.
 */
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { isoDay } from "@/lib/date";

/** Global standart (AppSetting kaliti). Sozlanmagan bo'lsa nazorat O'CHIQ. */
export const K_GLOBAL_MAX_STOCKDAY = "zakaz_max_stockday";

export interface StockdayLimits {
  /** Kompaniya bo'yicha standart; `null` — nazorat sozlanmagan. */
  global: number | null;
  /** categoryId → maxDays (kategoriya ham, subkategoriya ham bo'lishi mumkin). */
  byCategory: Map<number, number>;
}

let cache: { val: StockdayLimits; at: number } | null = null;

export async function getStockdayLimits(): Promise<StockdayLimits> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.val;

  const [setting, rows] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: K_GLOBAL_MAX_STOCKDAY } }).catch(() => null),
    prisma.stockdayLimit.findMany({ select: { categoryId: true, maxDays: true } }).catch(() => []),
  ]);

  const raw = (setting?.value ?? "").trim();
  const val: StockdayLimits = {
    global: /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null,
    byCategory: new Map(rows.map((r) => [r.categoryId, r.maxDays])),
  };
  cache = { val, at: Date.now() };
  return val;
}

export function clearStockdayLimitCache(): void {
  cache = null;
}

/**
 * SKU uchun amaldagi chegara. ENG ANIQ QOIDA USTUN:
 *   subkategoriya → ota kategoriya → global standart.
 * `null` — chegara belgilanmagan (nazorat qilinmaydi).
 */
export function limitFor(
  limits: StockdayLimits,
  categoryId: number | null,
  parentCategoryId: number | null
): number | null {
  if (categoryId != null) {
    const own = limits.byCategory.get(categoryId);
    if (own != null) return own;
  }
  if (parentCategoryId != null) {
    const parent = limits.byCategory.get(parentCategoryId);
    if (parent != null) return parent;
  }
  return limits.global;
}

export interface StockdayTekshiruv {
  /** Zakaz kelgandan keyingi zaxira kunlari; `null` — sotuv yo'q, hisoblab bo'lmaydi. */
  natijaviy: number | null;
  /** Amaldagi chegara (kun); `null` — nazorat yo'q. */
  limit: number | null;
  /** Chegaradan oshdimi. `natijaviy`/`limit` null bo'lsa — false. */
  oshdi: boolean;
  /** Chegaraga sig'adigan eng katta miqdor (dona); `null` — hisoblab bo'lmaydi. */
  ruxsatEtilgan: number | null;
}

/**
 * Bitta qator (SKU×filial yoki jami) uchun tekshiruv.
 *
 * `dailyAvg <= 0` — sotuv yo'q: stockday cheksiz bo'lardi, shuning uchun HISOBLANMAYDI
 * (`natijaviy = null`, `oshdi = false`). Bu ataylab: sotuvi yo'q SKU'ga zakaz berish
 * boshqa muammo (uni OOS/ABC hisoboti ko'rsatadi), bu chegaraning ishi emas.
 */
export function tekshir(input: {
  stock: number;
  qty: number;
  dailyAvg: number;
  limit: number | null;
}): StockdayTekshiruv {
  const { stock, qty, dailyAvg, limit } = input;
  if (!(dailyAvg > 0)) {
    return { natijaviy: null, limit, oshdi: false, ruxsatEtilgan: null };
  }
  const natijaviy = (stock + qty) / dailyAvg;
  if (limit == null) return { natijaviy, limit, oshdi: false, ruxsatEtilgan: null };

  // Chegaraga sig'adigan miqdor: qoldiq allaqachon oshib ketgan bo'lsa 0
  const ruxsatEtilgan = Math.max(0, Math.floor(limit * dailyAvg - stock));
  return { natijaviy, limit, oshdi: natijaviy > limit, ruxsatEtilgan };
}

export interface OshganQator {
  productId: number;
  code: number;
  name: string;
  kategoriya: string | null;
  qty: number;
  stock: number;
  dailyAvg: number;
  natijaviy: number; // zakaz kelgandan keyingi zaxira kunlari
  limit: number;
  ruxsatEtilgan: number; // chegaraga sig'adigan miqdor
}

/**
 * Zakazdagi chegaradan oshgan qatorlar. ACCEPTED holatiga o'tishda tasdiqlash
 * uchun ishlatiladi (bloklamaydi — tasdiq so'raladi).
 *
 * JAMI (SKU) darajasida tekshiriladi, filial kesimida emas: chegara kategoriya
 * bo'yicha belgilanadi va ortiqcha zaxira umumiy muammo. Filiallararo nomutanosiblik
 * boshqa hisobotning ishi (taqsimot / ko'chirish).
 */
export async function oshganQatorlar(orderId: number): Promise<OshganQator[]> {
  const limits = await getStockdayLimits();
  // Chegara umuman sozlanmagan bo'lsa — tekshiruv ham yo'q (bekorga SQL urmaymiz)
  if (limits.global == null && limits.byCategory.size === 0) return [];

  // Kunlik o'rtacha AYNI davrdan olinishi SHART — zakaz formasi ham `getDefaultRange()`
  // (joriy oy) ishlatadi (actions.ts: supplierItemsAction). Davr farq qilsa formada
  // signal chiqmay, ACCEPTED'da chiqib chalkashlik bo'lardi: bazada 210 kunlik tarix bor,
  // mavsumiy tovarda oylik va yillik o'rtacha bir necha barobar farq qiladi.
  const range = await getDefaultRange();
  const startStr = isoDay(range.start);
  const endStr = isoDay(range.end);

  const rows = await prisma.$queryRaw<
    {
      productId: number;
      code: number;
      name: string;
      categoryId: number | null;
      parentId: number | null;
      kategoriya: string | null;
      qty: number;
      stock: number;
      dailyAvg: number;
    }[]
  >`
    WITH oi AS (
      SELECT "productId", SUM(quantity)::float8 AS qty
      FROM "PurchaseOrderItem" WHERE "orderId" = ${orderId} GROUP BY "productId"
    ),
    snap AS (
      -- Oxirgi snapshot qoldig'i (filiallar yig'indisi) — /stockday bilan ayni manba
      SELECT s."productId", SUM(s."stockQty")::float8 AS stock
      FROM (
        SELECT DISTINCT ON (ps."productId", ps."branchId")
               ps."productId", ps."branchId", COALESCE(ps."stockQty", 0) AS "stockQty"
        FROM "ProductSales" ps
        JOIN oi ON oi."productId" = ps."productId"
        ORDER BY ps."productId", ps."branchId", ps."periodEnd" DESC
      ) s
      GROUP BY s."productId"
    ),
    daily AS (
      -- Kunlik o'rtacha = davr sotuvi / kuzatilgan kunlar (snapshot-reports.ts bilan ayni).
      -- Davr — joriy oy (getDefaultRange), zakaz formasi bilan BIR XIL.
      SELECT ps."productId",
             (COALESCE(SUM(ps."soldQty"), 0) / NULLIF(COUNT(DISTINCT ps."periodStart"), 0))::float8 AS "dailyAvg"
      FROM "ProductSales" ps
      JOIN oi ON oi."productId" = ps."productId"
      WHERE ps."periodStart" >= ${startStr}::date AND ps."periodEnd" <= ${endStr}::date
      GROUP BY ps."productId"
    )
    SELECT p.id AS "productId", p.code, p.name, p."categoryId", c."parentId",
           c.name AS kategoriya,
           oi.qty, COALESCE(snap.stock, 0) AS stock, COALESCE(daily."dailyAvg", 0) AS "dailyAvg"
    FROM oi
    JOIN "Product" p ON p.id = oi."productId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    LEFT JOIN snap ON snap."productId" = oi."productId"
    LEFT JOIN daily ON daily."productId" = oi."productId"
  `;

  const out: OshganQator[] = [];
  for (const r of rows) {
    const limit = limitFor(limits, r.categoryId, r.parentId);
    const t = tekshir({ stock: r.stock, qty: r.qty, dailyAvg: r.dailyAvg, limit });
    if (!t.oshdi || t.natijaviy == null || t.limit == null) continue;
    out.push({
      productId: r.productId,
      code: r.code,
      name: r.name,
      kategoriya: r.kategoriya,
      qty: r.qty,
      stock: r.stock,
      dailyAvg: r.dailyAvg,
      natijaviy: t.natijaviy,
      limit: t.limit,
      ruxsatEtilgan: t.ruxsatEtilgan ?? 0,
    });
  }
  // Eng yomon buzilish yuqorida
  return out.sort((a, b) => b.natijaviy / b.limit - a.natijaviy / a.limit);
}
