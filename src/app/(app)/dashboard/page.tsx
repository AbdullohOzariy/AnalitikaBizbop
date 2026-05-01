import { prisma } from "@/lib/prisma";
import {
  computeKPI,
  dailySalesSeries,
  dailyReceiptsSeries,
  branchShare,
  topCategories,
  branchPerformance,
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
import { ShoppingBag, Users, Receipt, TrendingUp, ArrowRight, Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "./period-filter";
import { DailyDynamicsChart, BranchShareChart, TopCategoriesChart } from "./charts";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; branchId?: string }>;
}) {
  const sp = await searchParams;
  const def = await getDefaultRange();
  const start = parseDate(sp.start, def.start);
  const end = parseDate(sp.end, def.end);
  const branchId = sp.branchId ? Number(sp.branchId) : undefined;
  const range = { start, end };

  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const [kpi, dailySales, dailyReceipts, share, top, perf] = await Promise.all([
    computeKPI(range, branchId),
    dailySalesSeries(range, branchId),
    dailyReceiptsSeries(range, branchId),
    branchShare(range),
    topCategories(range, branchId, 10),
    branchPerformance(range),
  ]);

  const hasAnyData = kpi.totalSales > 0 || kpi.totalReceipts > 0 || kpi.totalVisits > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {start.toISOString().slice(0, 10)} – {end.toISOString().slice(0, 10)}
            {branchId && ` · ${branches.find((b) => b.id === branchId)?.name ?? ""}`}
          </p>
        </div>
        <a
          href={`/api/export?start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}${branchId ? `&branchId=${branchId}` : ""}`}
        >
          <Button variant="outline" size="sm" className="shadow-sm hover:bg-primary hover:text-primary-foreground transition-all group">
            <Download className="h-4 w-4 mr-2 transition-transform group-hover:-translate-y-0.5" />
            Excel eksport
          </Button>
        </a>
      </div>

      <PeriodFilter
        start={start.toISOString().slice(0, 10)}
        end={end.toISOString().slice(0, 10)}
        branchId={branchId}
        branches={branches}
      />

      {!hasAnyData && (
        <Card className="border-dashed border-2 shadow-sm bg-muted/10">
          <CardContent className="py-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-4 bg-muted/50 rounded-full">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-lg font-medium">Ma'lumot topilmadi</p>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Tanlangan davrda ma'lumot topilmadi. Boshqa period tanlang yoki
                <a href="/admin/upload" className="text-primary font-medium hover:underline ml-1">fayl yuklang</a>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Umumiy Savdo"
          primary={formatUZS(kpi.totalSales, { compact: true })}
          secondary={`${formatUZS(kpi.totalSales)} so'm`}
          iconColorClass="text-blue-600 dark:text-blue-400"
          iconBgClass="bg-blue-100 dark:bg-blue-900/30"
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Tashriflar Soni"
          primary={formatNumber(kpi.totalVisits)}
          secondary={`${formatNumber(kpi.totalReceipts)} chek`}
          iconColorClass="text-orange-600 dark:text-orange-400"
          iconBgClass="bg-orange-100 dark:bg-orange-900/30"
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5" />}
          label="O'rtacha Chek"
          primary={formatUZS(kpi.avgReceipt)}
          secondary="so'm"
          iconColorClass="text-emerald-600 dark:text-emerald-400"
          iconBgClass="bg-emerald-100 dark:bg-emerald-900/30"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Konversiya"
          primary={formatPercent(kpi.conversion)}
          secondary="cheklar / tashriflar"
          iconColorClass="text-purple-600 dark:text-purple-400"
          iconBgClass="bg-purple-100 dark:bg-purple-900/30"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Kunlik Savdo va Chek Dinamikasi</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyDynamicsChart sales={dailySales} receipts={dailyReceipts} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filiallar Ulushi</CardTitle>
          </CardHeader>
          <CardContent>
            <BranchShareChart data={share} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Kategoriyalar (Fakt vs Reja)</CardTitle>
          </CardHeader>
          <CardContent>
            <TopCategoriesChart data={top} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filiallar Faoliyati</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Savdo (Fakt)</TableHead>
                <TableHead className="text-right">Tashriflar</TableHead>
                <TableHead className="text-right">Cheklar</TableHead>
                <TableHead className="text-right">O'rt. chek</TableHead>
                <TableHead className="text-right">Reja</TableHead>
                <TableHead className="text-right">Reja %</TableHead>
                <TableHead className="text-right">Konversiya</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perf.map((r) => (
                <TableRow key={r.branchId} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">
                    <Link
                      href={{
                        pathname: `/branches/${r.branchId}`,
                        query: {
                          start: start.toISOString().slice(0, 10),
                          end: end.toISOString().slice(0, 10),
                        },
                      }}
                      className="inline-flex items-center gap-2 font-medium hover:text-primary transition-colors group"
                    >
                      {r.branchName}
                      <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUZS(r.sales)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.visits)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.receipts)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUZS(r.avgReceipt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.plan > 0 ? formatUZS(r.plan) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.plan > 0 ? formatPercent(r.planPercent) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(r.conversion)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  primary,
  secondary,
  iconColorClass = "text-muted-foreground",
  iconBgClass = "bg-transparent",
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  iconColorClass?: string;
  iconBgClass?: string;
}) {
  return (
    <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 overflow-hidden group border-muted/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </CardTitle>
        <div className={`p-2 rounded-full transition-colors ${iconBgClass}`}>
          <span className={iconColorClass}>{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight text-foreground">{primary}</div>
        {secondary && (
          <p className="text-xs text-muted-foreground mt-1 font-medium">{secondary}</p>
        )}
      </CardContent>
    </Card>
  );
}
