/**
 * Analyze — narx sifati (data quality) tahlili. Manba: ProductSales (tayyor narxlar:
 * salePrice = Продажи/Цена, costPrice = Себестоимость/Цена).
 *
 * 3 ko'rinish — har biri ENG OXIRGI yuklangan davr (global MAX periodEnd) bo'yicha:
 *   A) branchPriceDiffs — bir SKU uchun filiallar sotuv narxi (salePrice) farq qiladi.
 *      + coverage — A) taqqoslashi qancha qamrab olganini ko'rsatadi (narxsiz qatorlar
 *        taqqoslashga kirmaydi, shuning uchun "farq yo'q" ≠ "muammo yo'q").
 *   B) salePriceMismatch — Продажи Сумма÷Количество ≠ Продажи Цена (faylda nomuvofiqlik).
 *   C) costPriceMismatch — Себестоимость Сумма÷Количество ≠ Себестоимость Цена.
 *
 * Nomuvofiqlik tolerantligi: yaxlitlash xatosini (narx 3 kasr, summa 2 kasr) e'tiborsiz
 * qoldirish uchun nisbiy 0.5% YOKI absolyut 1 so'm — qaysi katta bo'lsa.
 */
import { unstable_cache } from "next/cache";
import { isoDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

export type BranchPrice = { branchId: number; branchName: string; price: number };

export type BranchPriceDiff = {
  productId: number;
  code: number;
  name: string;
  categoryName: string | null;
  minPrice: number;
  maxPrice: number;
  spread: number; // maxPrice − minPrice
  spreadPct: number; // spread / minPrice × 100
  branches: BranchPrice[];
};

export type PriceMismatch = {
  productId: number;
  code: number;
  name: string;
  categoryName: string | null;
  branchId: number;
  branchName: string;
  soldQty: number;
  derivedPrice: number; // summa ÷ soni
  filePrice: number; // fayldagi tayyor narx
  diff: number; // derivedPrice − filePrice
  diffPct: number; // |diff| / filePrice × 100
};

/**
 * Qamrov (coverage) — "A) Filiallar narx farqi" taqqoslashi qancha ma'lumot ustidan
 * bajarilganini ko'rsatadi. Fayldagi Продажи/Цена bo'sh yoki 0 bo'lgan qatorlar
 * taqqoslashga UMUMAN kirmaydi; busiz ro'yxat toza ko'rinadi, aslida bir qismi
 * tekshirilmagan bo'ladi.
 */
/*
 * SKU'lar UCH kesishmaydigan toifaga bo'linadi (yig'indisi = skuTotal). Chegara
 * `diffRows` dagi `HAVING COUNT(*) > 1` bilan bir xil bo'lishi SHART: narxli
 * qatori bittadan ko'p bo'lmagan SKU taqqoslanmaydi, ya'ni u "to'liqmas
 * taqqoslangan" emas, "umuman taqqoslanmagan".
 *
 * Eslatma: qator YO'Qligi "narx yo'q" degani emas — parser faqat amount != 0
 * bo'lganda qator yozadi, ya'ni u filialda shunchaki sotilmagan. Shu sabab
 * "barcha filiallarida" emas, "mavjud qatorlarining hammasida" deymiz.
 */
export type PriceCoverage = {
  pricedRows: number; // narxi bor SKU×filial qatorlari (taqqoslanganlarning maxraji emas — quyiga qara)
  comparedRows: number; // HAQIQATDAN taqqoslashga kirgan qatorlar (>=2 narxli qatori bor SKU'larniki)
  unpricedRows: number; // salePrice null yoki <= 0 — taqqoslashdan tushib qolgan
  skuTotal: number; // davrdagi jami SKU
  skuFull: number; // >=2 narxli qatori bor va narxsizi yo'q — taqqoslash to'liq
  skuNone: number; // narxli qatori 2 tadan kam — taqqoslab bo'lmadi
  /**
   * ENG MUHIMI: >=2 filialda narx BOR (ya'ni taqqoslandi), lekin kamida bittasida
   * YO'Q. Natija ("farq 3%") ishonchsiz — narxsiz filialda narx butunlay boshqa
   * bo'lishi mumkin.
   */
  skuPartial: number;
};

export type PriceQuality = {
  periodEnd: string | null; // tahlil qilingan eng oxirgi davr (ISO sana), data yo'q bo'lsa null
  branchPriceDiffs: BranchPriceDiff[];
  coverage: PriceCoverage; // A) taqqoslash qamrovi
  salePriceMismatch: PriceMismatch[];
  costPriceMismatch: PriceMismatch[];
  truncated: boolean; // biror ro'yxat LIMIT'ga yetdimi (to'liq emas)
  truncatedDiffs: boolean; // FAQAT branchPriceDiffs qirqildimi (PDF hisoboti shuni ishlatadi)
};

const EMPTY_COVERAGE: PriceCoverage = {
  pricedRows: 0,
  comparedRows: 0,
  unpricedRows: 0,
  skuTotal: 0,
  skuFull: 0,
  skuNone: 0,
  skuPartial: 0,
};

const ROW_LIMIT = 500;

type DiffRow = {
  productId: number;
  code: number;
  name: string;
  categoryName: string | null;
  minPrice: number;
  maxPrice: number;
  branches: BranchPrice[];
};

type MismatchRow = {
  productId: number;
  code: number;
  name: string;
  categoryName: string | null;
  branchId: number;
  branchName: string;
  soldQty: number;
  derivedPrice: number;
  filePrice: number;
};

async function _compute(): Promise<PriceQuality> {
  // Eng oxirgi yuklangan davr — narx ustunlari bor qatorlar ichida (eski narxsiz
  // formatlar tahlilda qatnashmaydi).
  const peRows = await prisma.$queryRaw<{ pe: Date | null }[]>`
    SELECT MAX("periodEnd") AS pe
    FROM "ProductSales"
    WHERE "salePrice" IS NOT NULL OR "costPrice" IS NOT NULL
  `;
  const periodEnd = peRows[0]?.pe ?? null;
  if (!periodEnd) {
    return {
      periodEnd: null,
      branchPriceDiffs: [],
      coverage: EMPTY_COVERAGE,
      salePriceMismatch: [],
      costPriceMismatch: [],
      truncated: false,
      truncatedDiffs: false,
    };
  }

  // A) Filiallar narx farqi — bir SKU, eng oxirgi davr, salePrice MIN ≠ MAX.
  const diffRows = await prisma.$queryRaw<DiffRow[]>`
    WITH r AS (
      SELECT ps."productId", ps."branchId", ps."salePrice"::float8 AS price, b.name AS bname, b."sortOrder" AS so
      FROM "ProductSales" ps
      JOIN "Branch" b ON b.id = ps."branchId"
      WHERE ps."periodEnd" = ${periodEnd}::date
        AND ps."salePrice" IS NOT NULL AND ps."salePrice" > 0
    )
    SELECT r."productId" AS "productId", p.code AS code, p.name AS name, c.name AS "categoryName",
      MIN(r.price) AS "minPrice", MAX(r.price) AS "maxPrice",
      jsonb_agg(
        jsonb_build_object('branchId', r."branchId", 'branchName', r.bname, 'price', r.price)
        ORDER BY r.so, r."branchId"
      ) AS branches
    FROM r
    JOIN "Product" p ON p.id = r."productId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    GROUP BY r."productId", p.code, p.name, c.name
    HAVING COUNT(*) > 1 AND MIN(r.price) <> MAX(r.price)
    ORDER BY (MAX(r.price) - MIN(r.price)) / NULLIF(MIN(r.price), 0) DESC
    LIMIT ${ROW_LIMIT + 1}
  `;

  // A2) Qamrov — yuqoridagi taqqoslash qancha ma'lumot ustidan bajarilgani.
  //
  // Nega ALOHIDA so'rov: diffRows'ning WHERE'i narxsiz qatorlarni allaqachon tashlab
  // yuboradi, shuning uchun undan qamrovni chiqarib bo'lmaydi. Filtrni agregatga
  // (COUNT FILTER) ko'chirish uchun WHERE, GROUP BY va HAVING semantikasini qayta
  // yozish kerak bo'lardi — bu mavjud, ishlab turgan ro'yxatni buzish xavfi. Alohida
  // agregat so'rov bitta skan, arzon va diffRows'ga umuman tegmaydi.
  //
  // Baza AYNAN bir xil: o'sha "ProductSales", o'sha periodEnd, o'sha JOIN'lar
  // (Branch + Product — ikkalasi ham INNER, diffRows'dagidek). Product'da
  // "archivedAt" filtri diffRows'da YO'Q — shuning uchun bu yerda ham YO'Q, aks holda
  // foizlar ro'yxat bilan to'g'ri kelmaydi. (Eslatma: arxivlangan SKU'lar ikkala
  // hisobga ham kiradi — bu mavjud xatti-harakat, o'zgartirilmadi.)
  const covRows = await prisma.$queryRaw<
    {
      pricedRows: number;
      comparedRows: number;
      unpricedRows: number;
      skuTotal: number;
      skuFull: number;
      skuNone: number;
      skuPartial: number;
    }[]
  >`
    WITH r AS (
      SELECT ps."productId" AS pid,
        (ps."salePrice" IS NOT NULL AND ps."salePrice" > 0) AS priced
      FROM "ProductSales" ps
      JOIN "Branch" b ON b.id = ps."branchId"
      JOIN "Product" p ON p.id = ps."productId"
      WHERE ps."periodEnd" = ${periodEnd}::date
    ),
    per_sku AS (
      SELECT pid,
        COUNT(*) FILTER (WHERE r.priced) AS priced_cnt,
        COUNT(*) FILTER (WHERE NOT r.priced) AS unpriced_cnt
      FROM r
      GROUP BY pid
    )
    -- Toifalar chegarasi diffRows'dagi HAVING COUNT(*) > 1 bilan AYNAN bir xil:
    -- narxli qatori 2 tadan kam SKU taqqoslanmaydi. Uchtasi kesishmaydi va
    -- yig'indisi skuTotal ga teng: (priced<2) + (priced>1 & unpriced>0) + (priced>1 & unpriced=0).
    SELECT
      COALESCE(SUM(priced_cnt), 0)::int AS "pricedRows",
      COALESCE(SUM(priced_cnt) FILTER (WHERE priced_cnt > 1), 0)::int AS "comparedRows",
      COALESCE(SUM(unpriced_cnt), 0)::int AS "unpricedRows",
      COUNT(*)::int AS "skuTotal",
      COUNT(*) FILTER (WHERE priced_cnt > 1 AND unpriced_cnt = 0)::int AS "skuFull",
      COUNT(*) FILTER (WHERE priced_cnt < 2)::int AS "skuNone",
      COUNT(*) FILTER (WHERE priced_cnt > 1 AND unpriced_cnt > 0)::int AS "skuPartial"
    FROM per_sku
  `;
  const coverage: PriceCoverage = covRows[0]
    ? {
        pricedRows: Number(covRows[0].pricedRows),
        comparedRows: Number(covRows[0].comparedRows),
        unpricedRows: Number(covRows[0].unpricedRows),
        skuTotal: Number(covRows[0].skuTotal),
        skuFull: Number(covRows[0].skuFull),
        skuNone: Number(covRows[0].skuNone),
        skuPartial: Number(covRows[0].skuPartial),
      }
    : EMPTY_COVERAGE;

  // B) Продажи Сумма÷Количество ≠ Продажи Цена.
  const saleRows = await prisma.$queryRaw<MismatchRow[]>`
    SELECT ps."productId" AS "productId", p.code AS code, p.name AS name, c.name AS "categoryName",
      ps."branchId" AS "branchId", b.name AS "branchName",
      ps."soldQty"::float8 AS "soldQty",
      (ps.amount / ps."soldQty")::float8 AS "derivedPrice",
      ps."salePrice"::float8 AS "filePrice"
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    JOIN "Branch" b ON b.id = ps."branchId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE ps."periodEnd" = ${periodEnd}::date
      AND ps."salePrice" IS NOT NULL AND ps."salePrice" > 0
      AND ps."soldQty" IS NOT NULL AND ps."soldQty" > 0
      AND ABS(ps.amount / ps."soldQty" - ps."salePrice") > GREATEST(ps."salePrice" * 0.005, 1)
    ORDER BY ABS(ps.amount / ps."soldQty" - ps."salePrice") / ps."salePrice" DESC
    LIMIT ${ROW_LIMIT + 1}
  `;

  // C) Себестоимость Сумма÷Количество ≠ Себестоимость Цена.
  const costRows = await prisma.$queryRaw<MismatchRow[]>`
    SELECT ps."productId" AS "productId", p.code AS code, p.name AS name, c.name AS "categoryName",
      ps."branchId" AS "branchId", b.name AS "branchName",
      ps."soldQty"::float8 AS "soldQty",
      (ps."costAmount" / ps."soldQty")::float8 AS "derivedPrice",
      ps."costPrice"::float8 AS "filePrice"
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    JOIN "Branch" b ON b.id = ps."branchId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE ps."periodEnd" = ${periodEnd}::date
      AND ps."costPrice" IS NOT NULL AND ps."costPrice" > 0
      AND ps."costAmount" IS NOT NULL
      AND ps."soldQty" IS NOT NULL AND ps."soldQty" > 0
      AND ABS(ps."costAmount" / ps."soldQty" - ps."costPrice") > GREATEST(ps."costPrice" * 0.005, 1)
    ORDER BY ABS(ps."costAmount" / ps."soldQty" - ps."costPrice") / ps."costPrice" DESC
    LIMIT ${ROW_LIMIT + 1}
  `;

  // Ro'yxat-bo'yicha bayroq: umumiy `truncated` UCHALASI bo'yicha OR bo'lgani uchun
  // faqat bitta ro'yxatdan foydalanadigan iste'molchi (kunlik PDF hisoboti) uni
  // ishlata olmaydi — boshqa tab 500 ga yetsa soxta ogohlantirish chiqarardi.
  // `slice` dan OLDIN hisoblanadi: slice'dan keyin 500 va "501+" farqlanmaydi.
  const truncatedDiffs = diffRows.length > ROW_LIMIT;
  const truncated =
    truncatedDiffs || saleRows.length > ROW_LIMIT || costRows.length > ROW_LIMIT;

  const branchPriceDiffs: BranchPriceDiff[] = diffRows.slice(0, ROW_LIMIT).map((r) => {
    const minPrice = Number(r.minPrice);
    const maxPrice = Number(r.maxPrice);
    const spread = maxPrice - minPrice;
    return {
      productId: r.productId,
      code: r.code,
      name: r.name,
      categoryName: r.categoryName,
      minPrice,
      maxPrice,
      spread,
      spreadPct: minPrice > 0 ? (spread / minPrice) * 100 : 0,
      branches: (r.branches ?? []).map((b) => ({ ...b, price: Number(b.price) })),
    };
  });

  const toMismatch = (rows: MismatchRow[]): PriceMismatch[] =>
    rows.slice(0, ROW_LIMIT).map((r) => {
      const derivedPrice = Number(r.derivedPrice);
      const filePrice = Number(r.filePrice);
      const diff = derivedPrice - filePrice;
      return {
        productId: r.productId,
        code: r.code,
        name: r.name,
        categoryName: r.categoryName,
        branchId: r.branchId,
        branchName: r.branchName,
        soldQty: Number(r.soldQty),
        derivedPrice,
        filePrice,
        diff,
        diffPct: filePrice > 0 ? (Math.abs(diff) / filePrice) * 100 : 0,
      };
    });

  return {
    periodEnd: isoDay(periodEnd),
    branchPriceDiffs,
    coverage,
    salePriceMismatch: toMismatch(saleRows),
    costPriceMismatch: toMismatch(costRows),
    truncated,
    truncatedDiffs,
  };
}

/** Keshlangan (ANALYTICS_CACHE_TAG) — yangi sotuv fayli yuklanganda invalidatsiya bo'ladi. */
export function getPriceQuality(): Promise<PriceQuality> {
  // v2 — natijaga `coverage` qo'shildi; eski kesh yangi maydonsiz qaytmasligi uchun bump.
  return unstable_cache(_compute, ["analyze_price_quality_v3"], {
    tags: [ANALYTICS_CACHE_TAG],
    revalidate: 300,
  })();
}
