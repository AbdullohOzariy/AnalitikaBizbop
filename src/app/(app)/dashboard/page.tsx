import { prisma } from "@/lib/prisma";
import {
  computeKPI,
  dailySalesSeries,
  dailyReceiptsSeries,
  branchShare,
  topCategories,
  branchPerformance,
  getDefaultRange,
  type KPI,
} from "@/lib/analytics";
import { formatUZS, formatNumber, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShoppingBag, Users, Receipt, TrendingUp, ArrowRight, Download, BarChart3,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "./period-filter";
import {
  DailySalesChart, DailyReceiptsChart, BranchShareChart, TopCategoriesChart,
} from "./charts";
import { FadeIn, StaggerList, StaggerItem } from "@/components/motion";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function shiftMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}
function shiftYears(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + n);
  return r;
}
function shiftDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function getCompareRange(
  range: { start: Date; end: Date },
  compare: string,
  cstart?: string,
  cend?: string,
): { start: Date; end: Date } | null {
  if (compare === "wow") return { start: shiftDays(range.start, -7), end: shiftDays(range.end, -7) };
  if (compare === "mom") return { start: shiftMonths(range.start, -1), end: shiftMonths(range.end, -1) };
  if (compare === "yoy") return { start: shiftYears(range.start, -1), end: shiftYears(range.end, -1) };
  if (compare === "custom" && cstart && cend) {
    const s = parseDate(cstart, range.start);
    const e = parseDate(cend, range.end);
    if (s <= e) return { start: s, end: e };
  }
  return null;
}

function delta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string; end?: string; branchId?: string;
    compare?: string; cstart?: string; cend?: string;
  }>;
}) {
  const sp = await searchParams;
  const def = await getDefaultRange();
  const start = parseDate(sp.start, def.start);
  const end   = parseDate(sp.end,   def.end);
  const branchId = sp.branchId ? Number(sp.branchId) : undefined;
  const range = { start, end };

  const compareRange = sp.compare
    ? getCompareRange(range, sp.compare, sp.cstart, sp.cend)
    : null;

  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });

  const [kpi, kpiPrev, dailySales, dailyReceipts, share, top, perf] = await Promise.all([
    computeKPI(range, branchId),
    compareRange ? computeKPI(compareRange, branchId) : Promise.resolve<KPI | null>(null),
    dailySalesSeries(range, branchId),
    dailyReceiptsSeries(range, branchId),
    branchShare(range),
    topCategories(range, branchId, 18),
    branchPerformance(range),
  ]);

  const hasAnyData = kpi.totalSales > 0 || kpi.totalReceipts > 0 || kpi.totalVisits > 0;

  const compareLabel: Record<string, string> = {
    wow: "WOW", mom: "MOM", yoy: "YOY", custom: "Maxsus",
  };
  const cLabel = sp.compare ? (compareLabel[sp.compare] ?? "") : "";

  const KPIS: {
    icon: React.ReactNode;
    label: string;
    primary: string;
    secondary: string;
    curr: number;
    prev: number | null;
    iconColor: string;
    higherIsBetter: boolean;
  }[] = [
    {
      icon: <ShoppingBag className="h-5 w-5" />,
      label: "Umumiy Savdo",
      primary: formatUZS(kpi.totalSales, { compact: true }),
      secondary: formatUZS(kpi.totalSales) + " so'm",
      curr: kpi.totalSales,
      prev: kpiPrev?.totalSales ?? null,
      iconColor: "bg-[#10b981]/15 text-[#10b981]",
      higherIsBetter: true,
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      label: "Marja",
      primary: kpi.marja != null ? `${kpi.marja.toFixed(1)}%` : "—",
      secondary: "sotuv / tannarx",
      curr: kpi.marja ?? 0,
      prev: kpiPrev?.marja ?? null,
      iconColor: "bg-[#6366f1]/15 text-[#6366f1]",
      higherIsBetter: true,
    },
    {
      icon: <Users className="h-5 w-5" />,
      label: "Tashriflar Soni",
      primary: formatNumber(kpi.totalVisits),
      secondary: `${formatNumber(kpi.totalReceipts)} chek`,
      curr: kpi.totalVisits,
      prev: kpiPrev?.totalVisits ?? null,
      iconColor: "bg-[#facc15]/20 text-[#ca8a04]",
      higherIsBetter: true,
    },
    {
      icon: <Receipt className="h-5 w-5" />,
      label: "O'rtacha Chek",
      primary: formatUZS(kpi.avgReceipt),
      secondary: "so'm",
      curr: kpi.avgReceipt,
      prev: kpiPrev?.avgReceipt ?? null,
      iconColor: "bg-[#fb923c]/15 text-[#ea580c]",
      higherIsBetter: true,
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      label: "Konversiya",
      primary: formatPercent(kpi.conversion),
      secondary: "cheklar / tashriflar",
      curr: kpi.conversion,
      prev: kpiPrev?.conversion ?? null,
      iconColor: "bg-[#10b981]/15 text-[#10b981]",
      higherIsBetter: true,
    },
  ];

  return (
    <div className="space-y-6 font-['Sora',sans-serif]">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Dashboard Overview
          </h1>
          <p className="text-[14px] text-gray-500 font-normal mt-1">
            {start.toISOString().slice(0, 10)} – {end.toISOString().slice(0, 10)}
            {branchId && ` · ${branches.find((b) => b.id === branchId)?.name ?? ""}`}
          </p>
        </div>
        <a href={`/api/export?start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}${branchId ? `&branchId=${branchId}` : ""}`}>
          <Button variant="outline" size="sm" className="rounded-full bg-white dark:bg-zinc-900 border-none shadow-[0_4px_20px_rgb(0,0,0,0.05)] hover:bg-gray-50 text-gray-700 hover:text-gray-900 transition-all group px-5 h-10 font-medium">
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
        compare={sp.compare}
        cstart={sp.cstart}
        cend={sp.cend}
      />

      {!hasAnyData && (
        <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-gray-50/50">
          <CardContent className="py-20 flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-5 bg-white dark:bg-zinc-800 shadow-sm rounded-full">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-[18px] font-medium text-gray-900 dark:text-white">Ma&apos;lumot topilmadi</p>
              <p className="text-[14px] text-gray-500 max-w-sm mt-2 leading-relaxed">
                Tanlangan davrda ma&apos;lumot topilmadi. Boshqa period tanlang yoki{" "}
                <a href="/admin/upload" className="text-gray-900 dark:text-gray-200 font-medium hover:underline">fayl yuklang</a>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5 KPI cards */}
      <StaggerList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {KPIS.map((k) => {
          const d = k.prev != null ? delta(k.curr, k.prev) : null;
          return (
            <StaggerItem key={k.label}>
              <KpiCard
                icon={k.icon}
                label={k.label}
                primary={k.primary}
                secondary={k.secondary}
                iconColorClass={k.iconColor}
                delta={d}
                deltaLabel={cLabel}
                higherIsBetter={k.higherIsBetter}
              />
            </StaggerItem>
          );
        })}
      </StaggerList>

      {/* Kunlik savdo (3/4) + Filiallar ulushi (1/4) */}
      <FadeIn>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3 rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden">
          <CardHeader className="pt-8 px-8 pb-4">
            <CardTitle className="text-[18px] font-medium text-gray-900 dark:text-white">
              Kunlik Savdo Dinamikasi
            </CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <DailySalesChart sales={dailySales} />
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden">
          <CardHeader className="pt-8 px-8 pb-4">
            <CardTitle className="text-[18px] font-medium text-gray-900 dark:text-white">
              Filiallar Ulushi
            </CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <BranchShareChart data={share} />
          </CardContent>
        </Card>
      </div>

      {/* Kunlik chek soni */}
      <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden">
        <CardHeader className="pt-8 px-8 pb-4">
          <CardTitle className="text-[18px] font-medium text-gray-900 dark:text-white">
            Kunlik Chek Soni Dinamikasi
          </CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <DailyReceiptsChart receipts={dailyReceipts} />
        </CardContent>
      </Card>

      {/* Top kategoriyalar */}
      <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden">
        <CardHeader className="pt-8 px-8 pb-4">
          <CardTitle className="text-[18px] font-medium text-gray-900 dark:text-white">
            Top Kategoriyalar (Fakt vs Normal Reja)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <TopCategoriesChart data={top} />
        </CardContent>
      </Card>

      {/* Filiallar faoliyati */}
      <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden">
        <CardHeader className="pt-8 px-8 pb-4">
          <CardTitle className="text-[18px] font-medium text-gray-900 dark:text-white">
            Filiallar Faoliyati
          </CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Table>
            <TableHeader className="bg-transparent border-b border-gray-100 dark:border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[14px] font-medium text-gray-400">Filial</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">Savdo (Fakt)</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">Tashriflar</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">Cheklar</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">O&apos;rt. chek</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">Reja</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">Reja %</TableHead>
                <TableHead className="text-[14px] font-medium text-gray-400 text-right">Konversiya</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perf.map((r) => (
                <TableRow key={r.branchId} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-gray-50 dark:border-zinc-800/50">
                  <TableCell className="font-medium">
                    <Link
                      href={{ pathname: `/branches/${r.branchId}`, query: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) } }}
                      className="inline-flex items-center gap-2 text-[14px] font-medium text-gray-900 dark:text-gray-200 hover:text-gray-500 transition-colors group"
                    >
                      {r.branchName}
                      <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[14px] text-gray-700 dark:text-gray-300">{formatUZS(r.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[14px] text-gray-700 dark:text-gray-300">{formatNumber(r.visits)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[14px] text-gray-700 dark:text-gray-300">{formatNumber(r.receipts)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[14px] text-gray-700 dark:text-gray-300">{formatUZS(r.avgReceipt)}</TableCell>
                  <TableCell className="text-right tabular-nums text-[14px] text-gray-700 dark:text-gray-300">{r.plan > 0 ? formatUZS(r.plan) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.plan > 0 ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold ${r.planPercent >= 1 ? "bg-[#10b981]/10 text-[#10b981]" : "bg-[#f87171]/10 text-[#f87171]"}`}>
                        {formatPercent(r.planPercent)}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[14px]">
                    <span className="font-medium text-gray-500">{formatPercent(r.conversion)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </FadeIn>
    </div>
  );
}

function KpiCard({
  icon, label, primary, secondary, iconColorClass = "bg-gray-50 text-gray-700",
  delta: d, deltaLabel, higherIsBetter,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  iconColorClass?: string;
  delta?: number | null;
  deltaLabel?: string;
  higherIsBetter?: boolean;
}) {
  const isPositive = d != null && d > 0;
  const isNegative = d != null && d < 0;
  const good = higherIsBetter ? isPositive : isNegative;
  const bad  = higherIsBetter ? isNegative : isPositive;

  return (
    <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden hover:shadow-[0_15px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-6 px-6">
        <CardTitle className="text-[14px] font-medium text-gray-500 dark:text-gray-400">{label}</CardTitle>
        <div className={`p-3 rounded-full ${iconColorClass}`}>
          <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        <div className="text-[26px] lg:text-[30px] font-semibold text-gray-900 dark:text-gray-50 tracking-tight">{primary}</div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {d != null && (
            <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${good ? "bg-[#10b981]/10 text-[#10b981]" : bad ? "bg-[#f87171]/10 text-[#f87171]" : "bg-gray-100 text-gray-500"}`}>
              {d > 0 ? "+" : ""}{d.toFixed(1)}% {deltaLabel}
            </span>
          )}
          {secondary && <p className="text-[12px] text-gray-400 dark:text-gray-500">{secondary}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
