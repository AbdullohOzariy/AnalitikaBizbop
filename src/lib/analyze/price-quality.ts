/**
 * Analyze — narx sifati (data quality) tahlili. Manba: ProductSales (tayyor narxlar:
 * salePrice = Продажи/Цена, costPrice = Себестоимость/Цена).
 *
 * 3 ko'rinish — har biri ENG OXIRGI yuklangan davr (global MAX periodEnd) bo'yicha:
 *   A) branchPriceDiffs — bir SKU uchun filiallar sotuv narxi (salePrice) farq qiladi.
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

export type PriceQuality = {
  periodEnd: string | null; // tahlil qilingan eng oxirgi davr (ISO sana), data yo'q bo'lsa null
  branchPriceDiffs: BranchPriceDiff[];
  salePriceMismatch: PriceMismatch[];
  costPriceMismatch: PriceMismatch[];
  truncated: boolean; // biror ro'yxat LIMIT'ga yetdimi (to'liq emas)
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
    return { periodEnd: null, branchPriceDiffs: [], salePriceMismatch: [], costPriceMismatch: [], truncated: false };
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

  const truncated =
    diffRows.length > ROW_LIMIT || saleRows.length > ROW_LIMIT || costRows.length > ROW_LIMIT;

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
    salePriceMismatch: toMismatch(saleRows),
    costPriceMismatch: toMismatch(costRows),
    truncated,
  };
}

/** Keshlangan (ANALYTICS_CACHE_TAG) — yangi sotuv fayli yuklanganda invalidatsiya bo'ladi. */
export function getPriceQuality(): Promise<PriceQuality> {
  return unstable_cache(_compute, ["analyze_price_quality_v1"], {
    tags: [ANALYTICS_CACHE_TAG],
    revalidate: 300,
  })();
}
