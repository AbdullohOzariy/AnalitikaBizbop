import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  computeKPI,
  dailySalesSeries,
  dailyReceiptsSeries,
  dailyVisitsSeries,
  topCategories,
  getDefaultRange,
} from "@/lib/analytics";
import { formatUZS, formatNumber, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShoppingBag, Users, Receipt, TrendingUp } from "lucide-react";
import { PeriodFilter } from "../../dashboard/period-filter";
import {
  DailyDynamicsChart,
  TopCategoriesChart,
} from "../../dashboard/charts";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const branchId = Number(id);
  if (!Number.isFinite(branchId)) notFound();

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { aliases: true },
  });
  if (!branch) notFound();

  const def = await getDefaultRange();
  const start = parseDate(sp.start, def.start);
  const end = parseDate(sp.end, def.end);
  const range = { start, end };

  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const [kpi, dailySales, dailyReceipts, dailyVisits, top] = await Promise.all([
    computeKPI(range, branchId),
    dailySalesSeries(range, branchId),
    dailyReceiptsSeries(range, branchId),
    dailyVisitsSeries(range, branchId),
    topCategories(range, branchId, 12),
  ]);

  const topNoFact = top.length === 0 || top.every((t) => t.fact === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{branch.name}</h1>
          <p className="text-sm text-muted-foreground">
            {start.toISOString().slice(0, 10)} – {end.toISOString().slice(0, 10)}
          </p>
        </div>
      </div>

      <PeriodFilter
        start={start.toISOString().slice(0, 10)}
        end={end.toISOString().slice(0, 10)}
        branchId={branchId}
        branches={branches}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Savdo"
          primary={formatUZS(kpi.totalSales, { compact: true })}
          secondary={`${formatUZS(kpi.totalSales)} so'm`}
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Tashriflar"
          primary={formatNumber(kpi.totalVisits)}
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5" />}
          label="Cheklar / O'rt.chek"
          primary={formatNumber(kpi.totalReceipts)}
          secondary={`O'rt: ${formatUZS(kpi.avgReceipt)} so'm`}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Konversiya"
          primary={formatPercent(kpi.conversion)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Kunlik dinamika</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyDynamicsChart sales={dailySales} receipts={dailyReceipts} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Kunlik tashriflar</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyVisits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ma'lumot yo'q.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sana</TableHead>
                      <TableHead className="text-right">Tashriflar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyVisits.slice(-15).reverse().map((v) => (
                      <TableRow key={v.date}>
                        <TableCell>{v.date}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(v.value)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kategoriyalar (Fakt vs Reja)</CardTitle>
            </CardHeader>
            <CardContent>
              {topNoFact ? (
                <p className="text-sm text-muted-foreground">Sotuv ma'lumoti yo'q.</p>
              ) : (
                <TopCategoriesChart data={top} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{primary}</div>
        {secondary && (
          <p className="text-xs text-muted-foreground mt-1">{secondary}</p>
        )}
      </CardContent>
    </Card>
  );
}
