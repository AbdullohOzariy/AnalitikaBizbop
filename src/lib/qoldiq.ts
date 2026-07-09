/**
 * Qoldiq (ombor holati) hisoboti — SKU darajasida, tanlangan SANA holatiga.
 *
 * Qoldiq manbai IKKITA:
 *  1. ProductSales.stockQty — kunlik JSON import (product × branch × kun) qatorlari.
 *     Tanlangan sana uchun har (product, branch) bo'yicha ENG SO'NGGI snapshot olinadi
 *     (periodEnd <= sana, stockQty IS NOT NULL, DISTINCT ON uslubida). Filiallar
 *     bo'yicha yig'iladi (yoki bitta filial tanlansa — o'shaniki).
 *  2. WarehouseStock.qty — markaziy sklad (productId unique, sanadan mustaqil joriy holat).
 *
 * Har qator = bitta SKU. `day` — shu SKU qoldig'i qaysi kunga tegishli (filiallar
 * bo'yicha eng so'nggi periodEnd). `asOf` — o'sha kunlik importning UploadedFile.createdAt.
 *
 * Ma'lumot faqat import bo'lganda o'zgaradi — unstable_cache + ANALYTICS_CACHE_TAG
 * (import revalidateTag qiladi). Sahifa server-komponenti getQoldiqReport'ni chaqiradi.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

export type QoldiqSort = "qty" | "code" | "name";

export type QoldiqRow = {
  id: number;
  code: number;
  name: string;
  subName: string | null;
  catName: string | null;
  groupName: string | null;
  branchQty: number; // tanlangan filial qoldig'i yoki barcha filiallar yig'indisi
  warehouseQty: number | null; // markaziy sklad (WarehouseStock.qty)
  day: string; // shu SKU qoldig'i qaysi kunga tegishli (ISO YYYY-MM-DD, filiallar bo'yicha eng so'nggisi)
  asOf: string | null; // o'sha kunlik importning UploadedFile.createdAt (ISO datetime, UTC)
};

export type QoldiqReport = {
  rows: QoldiqRow[];
  total: number; // filtrga mos jami SKU (pagination uchun)
  asOf: string | null; // sarlavha uchun: ko'rsatilayotgan ma'lumotning eng so'nggi import createdAt (ISO)
  totals: { skuCount: number; branchQtySum: number; warehouseQtySum: number };
};

export type QoldiqParams = {
  dayStr: string; // YYYY-MM-DD
  branchId?: number;
  categoryId?: number; // subkategoriya IDsi (Product.categoryId)
  q?: string; // nom yoki kod qidiruv
  page: number;
  pageSize: number;
  scopeSubIds?: number[] | null; // kategoriya menejeri qamrovi (src/lib/scope.ts)
  sort?: QoldiqSort; // default qty desc
};

// timestamp → aniq ISO (UTC, 'Z' bilan). createdAt UTC saqlanadi (Neon UTC); to_char
// TZ konversiyasi qilmaydi — saqlangan raqamlarni o'zini formatlaydi, so'ngiga Z.
// Frontend formatDateTimeUZ buni UTC deb o'qib +5 (Toshkent) qiladi.
const AS_OF_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

function qoldiqWhere(p: QoldiqParams): Prisma.Sql {
  const conds: Prisma.Sql[] = [
    Prisma.sql`ps."periodEnd" <= ${p.dayStr}::date`,
    // Qoldiq bor snapshot: null (o'lchanmagan) qatorlar so'nggi holatga tortmasin.
    Prisma.sql`ps."stockQty" IS NOT NULL`,
    // Arxivlangan (no-aktiv) SKU monitoring ro'yxatlarida ko'rinmaydi (OOS/Stockday bilan izchil).
    Prisma.sql`p."archivedAt" IS NULL`,
  ];
  if (p.branchId) conds.push(Prisma.sql`ps."branchId" = ${p.branchId}`);
  if (p.categoryId) conds.push(Prisma.sql`p."categoryId" = ${p.categoryId}`);
  if (p.q) conds.push(Prisma.sql`(p.name ILIKE ${"%" + p.q + "%"} OR p.code::text = ${p.q})`);
  // Menejer qamrovi: [] → hech narsa (= ANY('{}') hech qachon rost), null → cheklovsiz.
  if (p.scopeSubIds) conds.push(Prisma.sql`p."categoryId" = ANY(${p.scopeSubIds}::int[])`);
  return Prisma.join(conds, " AND ");
}

// base → latest (har product×branch so'nggi snapshot) → per_product (filiallar yig'indisi + eng so'nggi kun).
// 731k+ qatorli ProductSales ustidan; keshlar tufayli faqat cache-miss'da yuradi.
function qoldiqCte(p: QoldiqParams): Prisma.Sql {
  return Prisma.sql`
    base AS (
      SELECT ps."productId", ps."branchId", ps."stockQty", ps."periodEnd", ps."uploadedFileId"
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      WHERE ${qoldiqWhere(p)}
    ),
    latest AS (
      SELECT DISTINCT ON ("productId", "branchId")
             "productId", "branchId", "stockQty", "periodEnd", "uploadedFileId"
      FROM base
      ORDER BY "productId", "branchId", "periodEnd" DESC
    ),
    per_product AS (
      SELECT "productId",
             SUM("stockQty")  AS branch_qty,
             MAX("periodEnd")  AS day
      FROM latest
      GROUP BY "productId"
    )`;
}

const SORT_SQL: Record<QoldiqSort, Prisma.Sql> = {
  qty:  Prisma.sql`pp.branch_qty DESC NULLS LAST`,
  code: Prisma.sql`p.code ASC`,
  name: Prisma.sql`p.name ASC`,
};

type RawTotals = {
  skuCount: number;
  branchQtySum: number;
  warehouseQtySum: number;
  asOf: string | null;
};

async function _getQoldiqReport(p: QoldiqParams): Promise<QoldiqReport> {
  const orderBy = SORT_SQL[p.sort ?? "qty"] ?? SORT_SQL.qty;
  const offset = (p.page - 1) * p.pageSize;

  const [rows, totalsRes] = await Promise.all([
    // Sahifa qatorlari — pagination SQL darajasida (LIMIT/OFFSET).
    prisma.$queryRaw<QoldiqRow[]>(Prisma.sql`
      WITH ${qoldiqCte(p)},
      asof AS (
        -- so'nggi kun (pp.day) importining createdAt'i (bir necha import bo'lsa — eng yangisi)
        SELECT l."productId", MAX(uf."createdAt") AS as_of
        FROM latest l
        JOIN per_product pp ON pp."productId" = l."productId" AND l."periodEnd" = pp.day
        JOIN "UploadedFile" uf ON uf.id = l."uploadedFileId"
        GROUP BY l."productId"
      )
      SELECT p.id, p.code, p.name,
             sub.name AS "subName", cat.name AS "catName", g.name AS "groupName",
             pp.branch_qty::float8 AS "branchQty",
             ws.qty::float8        AS "warehouseQty",
             pp.day::text          AS day,
             to_char(a.as_of, ${Prisma.raw(AS_OF_ISO)}) AS "asOf"
      FROM per_product pp
      JOIN "Product" p ON p.id = pp."productId"
      LEFT JOIN "Category" sub ON sub.id = p."categoryId"
      LEFT JOIN "Category" cat ON cat.id = sub."parentId"
      LEFT JOIN "CategoryGroup" g ON g.id = cat."groupId"
      LEFT JOIN "WarehouseStock" ws ON ws."productId" = pp."productId"
      LEFT JOIN asof a ON a."productId" = pp."productId"
      ORDER BY ${orderBy}, p.id ASC
      LIMIT ${p.pageSize} OFFSET ${offset}
    `),
    // Yig'indilar + jami SKU + sarlavha asOf — alohida yengil so'rov (CTE bir marta hisoblanadi).
    prisma.$queryRaw<RawTotals[]>(Prisma.sql`
      WITH ${qoldiqCte(p)}
      SELECT
        (SELECT COUNT(*) FROM per_product)::int AS "skuCount",
        (SELECT COALESCE(SUM(branch_qty), 0) FROM per_product)::float8 AS "branchQtySum",
        (SELECT COALESCE(SUM(ws.qty), 0)
           FROM per_product pp LEFT JOIN "WarehouseStock" ws ON ws."productId" = pp."productId"
        )::float8 AS "warehouseQtySum",
        (SELECT to_char(MAX(uf."createdAt"), ${Prisma.raw(AS_OF_ISO)})
           FROM latest l JOIN "UploadedFile" uf ON uf.id = l."uploadedFileId"
        ) AS "asOf"
    `),
  ]);

  const t = totalsRes[0] ?? { skuCount: 0, branchQtySum: 0, warehouseQtySum: 0, asOf: null };
  return {
    rows,
    total: t.skuCount,
    asOf: t.asOf ?? null,
    totals: {
      skuCount: t.skuCount,
      branchQtySum: t.branchQtySum,
      warehouseQtySum: t.warehouseQtySum,
    },
  };
}

/** Keshlangan qoldiq hisoboti — kalitda barcha parametrlar; import revalidate qiladi. */
export function getQoldiqReport(p: QoldiqParams): Promise<QoldiqReport> {
  const key = [
    "qoldiq_v1",
    p.dayStr,
    p.branchId ? String(p.branchId) : "all",
    p.categoryId ? String(p.categoryId) : "all",
    p.q ?? "",
    p.scopeSubIds ? `s${[...p.scopeSubIds].sort((a, b) => a - b).join(",")}` : "all",
    String(p.page),
    String(p.pageSize),
    p.sort ?? "qty",
  ];
  return unstable_cache(() => _getQoldiqReport(p), key, {
    tags: [ANALYTICS_CACHE_TAG],
    revalidate: false,
  })();
}
