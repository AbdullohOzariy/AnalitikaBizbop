import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";

const MAX_ROWS = 10_000;

const SORTS: Record<string, (d: "asc" | "desc") => Prisma.ProductSalesOrderByWithRelationInput> = {
  code: (d) => ({ product: { code: d } }),
  name: (d) => ({ product: { name: d } }),
  period: (d) => ({ periodStart: d }),
  stockQty: (d) => ({ stockQty: d }),
  soldQty: (d) => ({ soldQty: d }),
  amount: (d) => ({ amount: d }),
  costAmount: (d) => ({ costAmount: d }),
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
  if (session.user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const def = await getDefaultRange();
  const startDate = parseDate(sp.get("start")) ?? def.start;
  const endDate = parseDate(sp.get("end")) ?? def.end;
  const branchId = sp.get("branchId") ? parseInt(sp.get("branchId")!) : undefined;
  const catIds = sp.get("cats") ? sp.get("cats")!.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const q = sp.get("q")?.trim() ?? "";
  const sort = sp.get("sort") && SORTS[sp.get("sort")!] ? sp.get("sort")! : "";
  const dir: "asc" | "desc" = sp.get("dir") === "asc" ? "asc" : "desc";

  const where: Prisma.ProductSalesWhereInput = {
    periodStart: { gte: startDate },
    periodEnd: { lte: endDate },
    ...(branchId && { branchId }),
    ...(catIds.length > 0 && { product: { categoryId: { in: catIds } } }),
    ...(q && {
      OR: [
        { product: { name: { contains: q, mode: "insensitive" as const } } },
        { product: { code: { equals: parseInt(q) || undefined } } },
      ],
    }),
  };
  const orderBy: Prisma.ProductSalesOrderByWithRelationInput[] = sort
    ? [SORTS[sort](dir)]
    : [{ periodStart: "desc" }, { amount: "desc" }];

  const rows = await prisma.productSales.findMany({
    where,
    orderBy,
    take: MAX_ROWS,
    include: {
      product: { include: { category: { select: { name: true } } } },
      branch: { select: { name: true } },
    },
  });

  const header = ["Kod", "Mahsulot", "Kategoriya", "Filial", "Davr boshlanish", "Davr tugash", "Qoldiq", "Sotilgan", "Savdo", "Tannarx", "Marja%"];
  const data = rows.map((r) => {
    const amt = num(r.amount);
    const cost = r.costAmount != null ? num(r.costAmount) : null;
    const mj = cost !== null && amt > 0 ? Number((((amt - cost) / amt) * 100).toFixed(1)) : null;
    return [
      r.product.code,
      r.product.name,
      r.product.category?.name ?? "",
      r.branch.name,
      r.periodStart.toISOString().slice(0, 10),
      r.periodEnd.toISOString().slice(0, 10),
      r.stockQty != null ? num(r.stockQty) : "",
      r.soldQty != null ? num(r.soldQty) : "",
      amt,
      cost ?? "",
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
