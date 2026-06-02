import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BarChart2, Receipt, TrendingUp, Layers } from "lucide-react";
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

function fmtNum(n: unknown, decimals = 0): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: decimals }).format(num);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function BazaMetrikaPage({
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

  const startDate = parseDate(sp.start);
  const endDate = parseDate(sp.end);
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;

  const where = {
    ...(startDate && { date: { gte: startDate } }),
    ...(endDate && { date: { lte: endDate } }),
    ...(branchId && { branchId }),
  };

  const [totalCount, rows, branches, agg] = await Promise.all([
    prisma.dailyMetrics.count({ where }),
    prisma.dailyMetrics.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: [{ date: "desc" }, { branchId: "asc" }],
      include: { branch: { select: { id: true, name: true } } },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.dailyMetrics.aggregate({
      where,
      _sum: { receiptCount: true, receiptTotal: true },
      _avg: { avgReceipt: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart2}
        title="Metrikalar bazasi"
        description="Kunlik chek metrikalari — filial × sana (sr.xlsx fayllaridan)"
      >
        <BazaFilter
          basePath="/baza/metrika"
          branches={branches}
          defaultStart={sp.start ?? ""}
          defaultEnd={sp.end ?? ""}
          defaultBranchId={sp.branchId}
        />
      </PageHeader>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Jami yozuvlar"
          value={totalCount.toLocaleString("uz-UZ")}
          icon={Layers}
          tone="blue"
        />
        <StatCard
          label="Jami cheklar"
          value={fmtNum(agg._sum.receiptCount)}
          icon={Receipt}
          tone="green"
        />
        <StatCard
          label="O'rtacha chek"
          value={`${fmtNum(agg._avg.avgReceipt)} so'm`}
          icon={TrendingUp}
          tone="orange"
        />
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={BarChart2}
              title="Hali ma'lumot yo'q"
              description="Fayllar bo'limidan sr.xlsx formatidagi fayl yuklang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[110px]">Sana</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-right w-[90px]">Cheklar</TableHead>
                      <TableHead className="text-right w-[140px]">Jami savdo</TableHead>
                      <TableHead className="text-right w-[130px]">O'rtacha chek</TableHead>
                      <TableHead className="text-right w-[110px]">O'rt. tovar/chek</TableHead>
                      <TableHead className="text-right w-[130px]">Katta xarid</TableHead>
                      <TableHead className="text-right w-[130px]">Kichik xarid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="text-sm">
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(r.date)}
                        </TableCell>
                        <TableCell className="text-xs">{r.branch.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">
                          {fmtNum(r.receiptCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {fmtNum(r.receiptTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {fmtNum(r.avgReceipt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {fmtNum(r.avgItemsPerReceipt, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {fmtNum(r.bigPurchaseLevel)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {fmtNum(r.smallPurchaseLevel)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / jami {totalCount.toLocaleString("uz-UZ")} qator · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/baza/metrika" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
