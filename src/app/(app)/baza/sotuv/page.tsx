import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { Database, ShoppingBag, Layers, TrendingUp } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BazaFilter } from "../baza-filter";
import { BazaPagination } from "../baza-pagination";

const PAGE_SIZE = 50;

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtAmount(n: unknown): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ").format(Math.round(num));
}

function fmtQty(n: unknown): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(num);
}

export default async function BazaSotuvPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER") redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate = parseDate(sp.end) ?? def.end;
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  const categoryId = sp.categoryId ? parseInt(sp.categoryId) : undefined;
  const q = sp.q?.trim() ?? "";

  // Filtr sharti — faqat belgilangan period (period berilmasa — standart davr)
  const where = {
    periodStart: { gte: startDate },
    periodEnd: { lte: endDate },
    ...(branchId && { branchId }),
    ...(categoryId && { product: { categoryId } }),
    ...(q && {
      OR: [
        { product: { name: { contains: q, mode: "insensitive" as const } } },
        { product: { code: { equals: parseInt(q) || undefined } } },
      ],
    }),
  };

  const [totalCount, rows, branches, categories, agg] = await Promise.all([
    prisma.productSales.count({ where }),
    prisma.productSales.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: [{ periodStart: "desc" }, { amount: "desc" }],
      include: {
        product: { include: { category: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
      where: { products: { some: {} } },
    }),
    prisma.productSales.aggregate({
      where,
      _sum: { amount: true, costAmount: true, soldQty: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const totalAmount = agg._sum.amount ? Number(agg._sum.amount) : 0;
  const totalCost = agg._sum.costAmount ? Number(agg._sum.costAmount) : 0;
  const margin = totalAmount > 0 ? ((totalAmount - totalCost) / totalAmount) * 100 : 0;

  const startStr = sp.start ?? startDate.toISOString().slice(0, 10);
  const endStr = sp.end ?? endDate.toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Database}
        title="Sotuv bazasi"
        description="Mahsulot darajasida barcha sotuv yozuvlari (SKU × filial × davr)"
      >
        <BazaFilter
          basePath="/baza/sotuv"
          branches={branches}
          categories={categories}
          defaultStart={startStr}
          defaultEnd={endStr}
          defaultBranchId={sp.branchId}
          defaultCategoryId={sp.categoryId}
          defaultSearch={sp.q}
          showCategory
          showSearch
        />
      </PageHeader>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Jami qatorlar"
          value={totalCount.toLocaleString("uz-UZ")}
          icon={Layers}
          tone="blue"
          hint={`Sahifada: ${rows.length}`}
        />
        <StatCard
          label="Savdo summasi"
          value={`${fmtAmount(totalAmount)} so'm`}
          icon={ShoppingBag}
          tone="green"
        />
        <StatCard
          label="Tannarx"
          value={`${fmtAmount(totalCost)} so'm`}
          icon={Database}
          tone="orange"
        />
        <StatCard
          label="Marja"
          value={totalAmount > 0 ? `${margin.toFixed(1)}%` : "—"}
          icon={TrendingUp}
          tone={margin >= 15 ? "green" : margin > 0 ? "orange" : "default"}
        />
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Tanlangan davrda ma'lumot yo'q"
              description="Boshqa davr tanlang yoki Fayllar bo'limidan sotuv faylini yuklang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[90px]">Kod</TableHead>
                      <TableHead>Mahsulot</TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="w-[100px]">Davr</TableHead>
                      <TableHead className="text-right w-[90px]">Qoldiq</TableHead>
                      <TableHead className="text-right w-[80px]">Dona</TableHead>
                      <TableHead className="text-right w-[130px]">Savdo</TableHead>
                      <TableHead className="text-right w-[130px]">Tannarx</TableHead>
                      <TableHead className="text-right w-[70px]">Marja%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const amt = Number(r.amount);
                      const cost = r.costAmount ? Number(r.costAmount) : null;
                      const mj = cost !== null && amt > 0 ? ((amt - cost) / amt * 100) : null;
                      const mjColor =
                        mj === null ? "text-muted-foreground" :
                        mj >= 15 ? "text-primary font-medium" :
                        mj > 0 ? "text-amber-600 dark:text-amber-400" :
                        "text-destructive";
                      return (
                        <TableRow key={r.id} className="text-sm">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {r.product.code}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <span className="line-clamp-2 leading-snug">{r.product.name}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.product.category?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">{r.branch.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.periodStart.toISOString().slice(0, 10)}
                            {r.periodStart.toISOString().slice(0, 10) !== r.periodEnd.toISOString().slice(0, 10) && (
                              <> → {r.periodEnd.toISOString().slice(0, 10)}</>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {fmtQty(r.stockQty)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {fmtQty(r.soldQty)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">
                            {fmtAmount(r.amount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {r.costAmount ? fmtAmount(r.costAmount) : "—"}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums text-xs ${mjColor}`}>
                            {mj !== null ? `${mj.toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Sahifalash + info */}
              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / jami {totalCount.toLocaleString("uz-UZ")} qator · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/baza/sotuv" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
