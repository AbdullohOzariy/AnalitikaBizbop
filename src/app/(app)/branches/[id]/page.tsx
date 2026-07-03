import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
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
import { parseDateParam } from "@/lib/date";
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
import { PeriodFilter } from "@/components/common/period-filter";
import {
  DailyDynamicsChart,
  TopCategoriesChart,
} from "@/components/charts";

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !session.user.roles.includes("SYSTEM_ADMIN")) redirect("/dashboard-v2");

  const { id } = await params;
  const sp = await searchParams;
  const branchId = Number(id);
  if (!Number.isFinite(branchId)) notFound();

  // Parallel — uchta mustaqil so'rov ketma-ket waterfall bo'lib yurardi
  const [branch, def, branches] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, include: { aliases: true } }),
    getDefaultRange(),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!branch) notFound();

  const start = parseDateParam(sp.start, def.start)!;
  const end = parseDateParam(sp.end, def.end)!;
  const range = { start, end };
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
          accent="green"
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Tashriflar"
          primary={formatNumber(kpi.totalVisits)}
          accent="orange"
        />
        <KpiCard
          icon={<Receipt className="h-5 w-5" />}
          label="Cheklar / O'rt.chek"
          primary={formatNumber(kpi.totalReceipts)}
          secondary={`O'rt: ${formatUZS(kpi.avgReceipt)} so'm`}
          accent="purple"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Konversiya"
          primary={formatPercent(kpi.conversion)}
          accent="cyan"
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
              <CardTitle>Kategoriyalar</CardTitle>
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

const ACCENT_STYLES = {
  green:  { iconBg: "bg-[#1FBF5C]/15", iconColor: "text-[#15803d]",  bar: "bg-[#1FBF5C]" },
  orange: { iconBg: "bg-[#FF8730]/15", iconColor: "text-[#b85a10]",  bar: "bg-[#FF8730]" },
  purple: { iconBg: "bg-[#7B69EE]/15", iconColor: "text-[#4b38b3]",  bar: "bg-[#7B69EE]" },
  cyan:   { iconBg: "bg-[#4EC8E4]/15", iconColor: "text-[#1a7d96]",  bar: "bg-[#4EC8E4]" },
} as const;

function KpiCard({
  icon,
  label,
  primary,
  secondary,
  accent = "green",
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  accent?: keyof typeof ACCENT_STYLES;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <Card className="overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-border/60">
      <div className={`h-1 w-full ${s.bar}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className={`p-2.5 rounded-xl ${s.iconBg}`}>
          <span className={s.iconColor}>{icon}</span>
        </div>
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
