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
import { ExpandableCard } from "@/components/ui/expandable-card";
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
  const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + n); return r;
}
function shiftYears(d: Date, n: number): Date {
  const r = new Date(d); r.setUTCFullYear(r.getUTCFullYear() + n); return r;
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

function calcDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

const CARD_PAD = "px-4 sm:px-6 lg:px-8";
const CARD_PT  = "pt-5 sm:pt-6 lg:pt-8";
const CARD_PB  = "pb-4 sm:pb-6 lg:pb-8";

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
  const cLabel = sp.compare ? ({ wow: "WOW", mom: "MOM", yoy: "YOY", custom: "Maxsus" }[sp.compare] ?? "") : "";

  const KPIS: {
    icon: React.ReactNode; label: string; primary: string; secondary: string;
    curr: number; prev: number | null; iconColor: string; higherIsBetter: boolean;
  }[] = [
    {
      icon: <ShoppingBag className="h-5 w-5" />, label: "Umumiy Savdo",
      primary: formatUZS(kpi.totalSales, { compact: true }),
      secondary: formatUZS(kpi.totalSales),
      curr: kpi.totalSales, prev: kpiPrev?.totalSales ?? null,
      iconColor: "bg-emerald-500/10 text-emerald-600", higherIsBetter: true,
    },
    {
      icon: <BarChart3 className="h-5 w-5" />, label: "Marja",
      primary: kpi.marja != null ? `${kpi.marja.toFixed(1)}%` : "—",
      secondary: "sotuv / tannarx",
      curr: kpi.marja ?? 0, prev: kpiPrev?.marja ?? null,
      iconColor: "bg-violet-500/10 text-violet-600", higherIsBetter: true,
    },
    {
      icon: <Users className="h-5 w-5" />, label: "Tashriflar Soni",
      primary: formatNumber(kpi.totalVisits),
      secondary: `${formatNumber(kpi.totalReceipts)} chek`,
      curr: kpi.totalVisits, prev: kpiPrev?.totalVisits ?? null,
      iconColor: "bg-amber-400/15 text-amber-600", higherIsBetter: true,
    },
    {
      icon: <Receipt className="h-5 w-5" />, label: "O'rtacha Chek",
      primary: formatUZS(kpi.avgReceipt, { compact: true }),
      secondary: formatUZS(kpi.avgReceipt),
      curr: kpi.avgReceipt, prev: kpiPrev?.avgReceipt ?? null,
      iconColor: "bg-orange-500/10 text-orange-600", higherIsBetter: true,
    },
    {
      icon: <TrendingUp className="h-5 w-5" />, label: "Konversiya",
      primary: formatPercent(kpi.conversion),
      secondary: "cheklar / tashriflar",
      curr: kpi.conversion, prev: kpiPrev?.conversion ?? null,
      iconColor: "bg-emerald-500/10 text-emerald-600", higherIsBetter: true,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start sm:items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {start.toISOString().slice(0, 10)} – {end.toISOString().slice(0, 10)}
            {branchId && ` · ${branches.find((b) => b.id === branchId)?.name ?? ""}`}
          </p>
        </div>
        <a href={`/api/export?start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}${branchId ? `&branchId=${branchId}` : ""}`}>
          <Button variant="outline" size="sm"
            className="rounded-full bg-card border-border/60 hover:bg-secondary gap-2 h-9 px-4 text-sm font-medium shadow-sm">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Excel eksport</span>
            <span className="sm:hidden">Eksport</span>
          </Button>
        </a>
      </div>

      {/* ── Period filter ── */}
      <PeriodFilter
        start={start.toISOString().slice(0, 10)}
        end={end.toISOString().slice(0, 10)}
        branchId={branchId}
        branches={branches}
        compare={sp.compare}
        cstart={sp.cstart}
        cend={sp.cend}
      />

      {/* ── Empty state ── */}
      {!hasAnyData && (
        <Card className="rounded-2xl border-none shadow-sm bg-card">
          <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-4">
            <div className="p-4 bg-muted rounded-full">
              <ShoppingBag className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-base font-medium">Ma&apos;lumot topilmadi</p>
              <p className="text-sm text-muted-foreground max-w-xs mt-1 leading-relaxed">
                Tanlangan davrda ma&apos;lumot yo&apos;q. Boshqa period tanlang yoki{" "}
                <a href="/admin/upload" className="font-medium underline underline-offset-2">fayl yuklang</a>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 5 KPI cards ── */}
      <StaggerList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {KPIS.map((k) => {
          const d = k.prev != null ? calcDelta(k.curr, k.prev) : null;
          return (
            <StaggerItem key={k.label} className="h-full">
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

      <FadeIn className="space-y-4 sm:space-y-6">
        {/* ── Kunlik savdo (2/3) + Filiallar ulushi (1/3) ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <ExpandableCard
            title="Kunlik Savdo Dinamikasi"
            className="xl:col-span-2 rounded-2xl border-none shadow-sm bg-card overflow-hidden"
            headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
            contentClassName={`${CARD_PAD} ${CARD_PB}`}
          >
            <DailySalesChart sales={dailySales} />
          </ExpandableCard>

          <ExpandableCard
            title="Filiallar Ulushi"
            className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
            headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
            contentClassName={`${CARD_PAD} ${CARD_PB}`}
          >
            <BranchShareChart data={share} />
          </ExpandableCard>
        </div>

        {/* ── Kunlik chek soni ── */}
        <ExpandableCard
          title="Kunlik Chek Soni Dinamikasi"
          className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
          headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
          contentClassName={`${CARD_PAD} ${CARD_PB}`}
        >
          <DailyReceiptsChart receipts={dailyReceipts} />
        </ExpandableCard>

        {/* ── Top kategoriyalar ── */}
        <ExpandableCard
          title="Top Kategoriyalar — Fakt vs Reja"
          className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
          headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
          contentClassName={`${CARD_PAD} ${CARD_PB}`}
        >
          <TopCategoriesChart data={top} />
        </ExpandableCard>

        {/* ── Filiallar faoliyati ── */}
        <ExpandableCard
          title="Filiallar Faoliyati"
          className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
          headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border/60">
                  <TableHead className={`${CARD_PAD} text-xs font-medium text-muted-foreground`}>Filial</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Savdo</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Tashriflar</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Cheklar</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">O&apos;rt. chek</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Reja</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Reja %</TableHead>
                  <TableHead className={`${CARD_PAD} text-xs font-medium text-muted-foreground text-right`}>Konversiya</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.map((r) => (
                  <TableRow key={r.branchId}
                    className="hover:bg-muted/40 transition-colors border-b border-border/30 last:border-0">
                    <TableCell className={`${CARD_PAD} py-3`}>
                      <Link
                        href={{ pathname: `/branches/${r.branchId}`, query: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) } }}
                        className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors group"
                      >
                        {r.branchName}
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-60 group-hover:translate-x-0.5 transition-all" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatUZS(r.sales, { compact: true })}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatNumber(r.visits)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatNumber(r.receipts)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatUZS(r.avgReceipt, { compact: true })}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{r.plan > 0 ? formatUZS(r.plan, { compact: true }) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.plan > 0 ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          r.planPercent >= 1
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}>
                          {formatPercent(r.planPercent)}
                        </span>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell className={`${CARD_PAD} text-right tabular-nums text-sm text-muted-foreground`}>
                      {formatPercent(r.conversion)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ExpandableCard>
      </FadeIn>
    </div>
  );
}

function KpiCard({
  icon, label, primary, secondary,
  iconColorClass = "bg-muted text-muted-foreground",
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
  const good = d != null && (higherIsBetter ? d > 0 : d < 0);
  const bad  = d != null && (higherIsBetter ? d < 0 : d > 0);

  return (
    <Card className="h-full rounded-2xl border-none shadow-sm bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 pt-4 sm:pt-5 px-4 sm:px-5">
        <CardTitle className="text-xs sm:text-[13px] font-medium text-muted-foreground leading-snug">{label}</CardTitle>
        <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${iconColorClass}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
        <div className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{primary}</div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap min-h-[20px]">
          {d != null ? (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              good ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : bad ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-muted text-muted-foreground"
            }`}>
              {d > 0 ? "↑" : d < 0 ? "↓" : "→"} {Math.abs(d).toFixed(1)}% {deltaLabel}
            </span>
          ) : secondary ? (
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{secondary}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
