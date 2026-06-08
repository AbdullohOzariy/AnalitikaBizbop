import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { isAdminTier } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";

const MAX_ROWS = 10_000;

const MARJA_SQL = `(CASE WHEN ps."costAmount" IS NOT NULL AND ps."amount" > 0 THEN (ps."amount" - ps."costAmount") / ps."amount" * 100 ELSE NULL END)`;
const SORT_SQL: Record<string, string> = {
  code: 'p."code"', name: 'p."name"', period: 'ps."periodStart"',
  stockQty: 'ps."stockQty"', soldQty: 'ps."soldQty"', amount: 'ps."amount"', costAmount: 'ps."costAmount"',
  marja: MARJA_SQL,
};

type Row = {
  pcode: number; pname: string; cname: string | null; bname: string;
  periodStart: string; periodEnd: string;
  stockQty: string | null; soldQty: string | null; amount: string; costAmount: string | null;
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
  if (!isAdminTier(session.user.role)) return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const def = await getDefaultRange();
  const startDate = parseDate(sp.get("start")) ?? def.start;
  const endDate = parseDate(sp.get("end")) ?? def.end;
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const branchId = sp.get("branchId") ? parseInt(sp.get("branchId")!) : undefined;
  const catIds = sp.get("cats") ? sp.get("cats")!.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const q = sp.get("q")?.trim() ?? "";
  const mmin = sp.get("mmin") && !isNaN(Number(sp.get("mmin"))) ? Number(sp.get("mmin")) : undefined;
  const mmax = sp.get("mmax") && !isNaN(Number(sp.get("mmax"))) ? Number(sp.get("mmax")) : undefined;
  const sortKey = sp.get("sort") && SORT_SQL[sp.get("sort")!] ? sp.get("sort")! : "";
  const dirSql = sp.get("dir") === "asc" ? "ASC" : "DESC";

  const conds: Prisma.Sql[] = [
    Prisma.sql`ps."periodStart" >= ${startStr}::date`,
    Prisma.sql`ps."periodEnd" <= ${endStr}::date`,
  ];
  if (branchId) conds.push(Prisma.sql`ps."branchId" = ${branchId}`);
  if (catIds.length > 0) conds.push(Prisma.sql`p."categoryId" IN (${Prisma.join(catIds)})`);
  if (q) conds.push(Prisma.sql`(p."name" ILIKE ${"%" + q + "%"} OR p."code"::text = ${q})`);
  if (mmin != null) conds.push(Prisma.sql`${Prisma.raw(MARJA_SQL)} >= ${mmin}`);
  if (mmax != null) conds.push(Prisma.sql`${Prisma.raw(MARJA_SQL)} <= ${mmax}`);
  const orderRaw = sortKey
    ? Prisma.raw(`${SORT_SQL[sortKey]} ${dirSql} NULLS LAST`)
    : Prisma.raw(`ps."periodStart" DESC, ps."amount" DESC`);

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT p."code" AS pcode, p."name" AS pname, c."name" AS cname, b."name" AS bname,
           ps."periodStart"::text AS "periodStart", ps."periodEnd"::text AS "periodEnd",
           ps."stockQty", ps."soldQty", ps."amount", ps."costAmount"
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    JOIN "Branch" b ON b.id = ps."branchId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY ${orderRaw}
    LIMIT ${MAX_ROWS}`);

  const header = ["Kod", "Mahsulot", "Kategoriya", "Filial", "Davr boshlanish", "Davr tugash", "Qoldiq", "Sotilgan", "Savdo", "Bir dona narx", "Tannarx", "Bir dona tannarx", "Marja%"];
  const data = rows.map((r) => {
    const amt = num(r.amount);
    const cost = r.costAmount != null ? num(r.costAmount) : null;
    const sold = r.soldQty != null ? num(r.soldQty) : 0;
    const mj = cost !== null && amt > 0 ? Number((((amt - cost) / amt) * 100).toFixed(1)) : null;
    return [
      r.pcode, r.pname, r.cname ?? "", r.bname,
      r.periodStart, r.periodEnd,
      r.stockQty != null ? num(r.stockQty) : "",
      sold || "",
      amt,
      sold > 0 ? Math.round(amt / sold) : "",
      cost ?? "",
      cost !== null && sold > 0 ? Math.round(cost / sold) : "",
      mj ?? "",
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), "Sotuv");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fn = `sotuv-${startDate.toISOString().slice(0, 10)}_${endDate.toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fn}"`,
      "Cache-Control": "no-store",
    },
  });
}
