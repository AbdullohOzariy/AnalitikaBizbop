import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";

const MAX_ROWS = 10_000;
const CRITICAL = 3, LOW = 7, NORMAL = 30;
type View = "kritik" | "kam" | "normal" | "ortiqcha";

type Row = {
  pcode: number; pname: string; cname: string | null; bname: string;
  periodEnd: string;
  stockQty: string | null; avgDaily: string | null; stockDays: string | null; stockValue: string | null;
};

function parseDate(s: string | null): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}
function num(n: unknown): number {
  const v = typeof n === "object" && n !== null && "toNumber" in n ? (n as { toNumber(): number }).toNumber() : Number(n);
  return isNaN(v) ? 0 : v;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const roles = session.user.roles;
  if (!canSeeAnalytics(roles)) return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const def = await getDefaultRange();
  const startDate = parseDate(sp.get("start")) ?? def.start;
  const endDate = parseDate(sp.get("end")) ?? def.end;
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const branchId = sp.get("branchId") ? parseInt(sp.get("branchId")!) : undefined;
  const categoryId = sp.get("categoryId") ? parseInt(sp.get("categoryId")!) : undefined;
  const q = sp.get("q")?.trim() ?? "";
  const viewParam = sp.get("view");
  const view: View =
    viewParam === "kam" || viewParam === "normal" || viewParam === "ortiqcha" ? viewParam : "kritik";

  const inner: Prisma.Sql[] = [
    Prisma.sql`ps."periodStart" >= ${startStr}::date`,
    Prisma.sql`ps."periodEnd" <= ${endStr}::date`,
  ];
  if (branchId) inner.push(Prisma.sql`ps."branchId" = ${branchId}`);
  if (categoryId) inner.push(Prisma.sql`p."categoryId" = ${categoryId}`);
  if (q) inner.push(Prisma.sql`(p.name ILIKE ${"%" + q + "%"} OR p.code::text = ${q})`);
  const innerWhere = Prisma.join(inner, " AND ");

  const sdCte = Prisma.sql`
    base AS (
      SELECT ps."productId", ps."branchId", ps."stockQty", ps."soldQty", ps."costAmount",
             ps."periodStart", ps."periodEnd",
             p.code, p.name AS pname, p."categoryId", b.name AS bname
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      JOIN "Branch"  b ON b.id = ps."branchId"
      WHERE ${innerWhere}
    ),
    latest AS (
      SELECT DISTINCT ON ("productId", "branchId")
             "productId", "branchId", "stockQty", "periodEnd", code, pname, "categoryId", bname
      FROM base
      ORDER BY "productId", "branchId", "periodEnd" DESC
    ),
    agg AS (
      SELECT "productId", "branchId",
             COALESCE(SUM("soldQty"), 0) AS sold_total,
             COALESCE(SUM("costAmount"), 0) AS cost_total,
             COUNT(DISTINCT "periodStart") AS tracked_days
      FROM base
      GROUP BY "productId", "branchId"
    ),
    sd AS (
      SELECT l."productId", l."branchId", l.code, l.pname, l."categoryId", l.bname, l."periodEnd",
             l."stockQty",
             (a.sold_total / NULLIF(a.tracked_days, 0)) AS avg_daily,
             CASE
               WHEN l."stockQty" > 0 AND a.sold_total > 0 AND a.tracked_days > 0
               THEN l."stockQty" / (a.sold_total / a.tracked_days)
               ELSE NULL
             END AS stock_days,
             CASE
               WHEN l."stockQty" > 0 AND a.sold_total > 0 AND a.cost_total > 0
               THEN l."stockQty" * (a.cost_total / a.sold_total)
               ELSE NULL
             END AS stock_value
      FROM latest l
      JOIN agg a ON a."productId" = l."productId" AND a."branchId" = l."branchId"
    )`;

  const viewCond: Record<View, Prisma.Sql> = {
    kritik:   Prisma.sql`sd.stock_days IS NOT NULL AND sd.stock_days <= ${CRITICAL}`,
    kam:      Prisma.sql`sd.stock_days > ${CRITICAL} AND sd.stock_days <= ${LOW}`,
    normal:   Prisma.sql`sd.stock_days > ${LOW} AND sd.stock_days <= ${NORMAL}`,
    ortiqcha: Prisma.sql`sd.stock_days > ${NORMAL}`,
  };
  const orderRaw = view === "ortiqcha" ? Prisma.raw(`sd.stock_days DESC`) : Prisma.raw(`sd.stock_days ASC`);

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    WITH ${sdCte}
    SELECT sd.code AS pcode, sd.pname, c.name AS cname, sd.bname,
           sd."periodEnd"::text AS "periodEnd",
           sd."stockQty", sd.avg_daily AS "avgDaily", sd.stock_days AS "stockDays", sd.stock_value AS "stockValue"
    FROM sd
    LEFT JOIN "Category" c ON c.id = sd."categoryId"
    WHERE ${viewCond[view]}
    ORDER BY ${orderRaw}
    LIMIT ${MAX_ROWS}`);

  const header = ["Kod", "Mahsulot", "Kategoriya", "Filial", "Snapshot", "Qoldiq", "Sotuv/kun", "Zaxira kunlari", "Qoldiq qiymati"];
  const data = rows.map((r) => [
    r.pcode, r.pname, r.cname ?? "", r.bname,
    r.periodEnd.slice(0, 10),
    r.stockQty != null ? num(r.stockQty) : "",
    r.avgDaily != null ? Number(num(r.avgDaily).toFixed(2)) : "",
    r.stockDays != null ? Number(num(r.stockDays).toFixed(1)) : "",
    r.stockValue != null ? Math.round(num(r.stockValue)) : "",
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), "Stockday");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fn = `stockday-${view}-${startStr}_${endStr}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fn}"`,
      "Cache-Control": "no-store",
    },
  });
}
