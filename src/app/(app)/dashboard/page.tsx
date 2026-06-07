import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
import { Card, CardContent } from "@/components/ui/card";
import { ExpandableCard } from "@/components/ui/expandable-card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShoppingBag, Users, Receipt, TrendingUp, ArrowRight, Download, BarChart3, LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodFilter } from "@/components/common/period-filter";
import {
  DailySalesChart, DailyReceiptsChart, BranchShareChart, TopCategoriesChart,
} from "@/components/charts";
import { StaggerList, StaggerItem } from "@/components/motion";

// ─── Yordamchi funksiyalar ────────────────────────────────────────────────────

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function shiftDays(d: Date, n: number)   { return new Date(d.getTime() + n * 86400000); }
function shiftMonths(d: Date, n: number) { const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + n); return r; }
function shiftYears(d: Date, n: number)  { const r = new Date(d); r.setUTCFullYear(r.getUTCFullYear() + n); return r; }

function getCompareRange(
  range: { start: Date; end: Date },
  compare: string,
  cstart?: string, cend?: string,
): { start: Date; end: Date } | null {
  if (compare === "wow") return { start: shiftDays(range.start, -7),    end: shiftDays(range.end, -7) };
  if (compare === "mom") return { start: shiftMonths(range.start, -1),  end: shiftMonths(range.end, -1) };
  if (compare === "yoy") return { start: shiftYears(range.start, -1),   end: shiftYears(range.end, -1) };
  if (compare === "custom" && cstart && cend) {
    const s = parseDate(cstart, range.start);
    const e = parseDate(cend,   range.end);
    if (s <= e) return { start: s, end: e };
  }
  return null;
}

function getCompareLabel(compare: string): string {
  return {
    wow: "O'tgan hafta",
    mom: "O'tgan oy",
    yoy: "O'tgan yil",
    custom: "Maxsus davr",
  }[compare] ?? "";
}

function calcDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

const CARD_PAD = "px-4 sm:px-6 lg:px-8";
const CARD_PT  = "pt-5 sm:pt-6 lg:pt-8";
const CARD_PB  = "pb-4 sm:pb-6 lg:pb-8";

// ─── Skeleton komponentlari ───────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card ring-1 ring-foreground/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Skeleton className="xl:col-span-2 h-[340px] rounded-2xl" />
        <Skeleton className="h-[340px] rounded-2xl" />
      </div>
      <Skeleton className="h-[280px] rounded-2xl" />
      <Skeleton className="h-[400px] rounded-2xl" />
      <Skeleton className="h-[300px] rounded-2xl" />
    </div>
  );
}

// ─── Async sub-komponentlar ───────────────────────────────────────────────────

async function KpiSection({
  startStr, endStr, branchId,
  compare, cstart, cend,
}: {
  startStr: string; endStr: string; branchId?: number;
  compare?: string; cstart?: string; cend?: string;
}) {
  const start = new Date(startStr + "T00:00:00.000Z");
  const end   = new Date(endStr   + "T00:00:00.000Z");
  const range = { start, end };
  const compareMode = compare === "none" ? undefined : compare ?? "mom";
  const compareRange = compareMode ? getCompareRange(range, compareMode, cstart, cend) : null;
  const cLabel = compareMode ? getCompareLabel(compareMode) : "";

  const [kpi, kpiPrev] = await Promise.all([
    computeKPI(range, branchId),
    compareRange ? computeKPI(compareRange, branchId) : Promise.resolve<KPI | null>(null),
  ]);

  const hasAnyData = kpi.totalSales > 0 || kpi.totalReceipts > 0 || kpi.totalVisits > 0;

  if (!hasAnyData) {
    return (
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
    );
  }

  const KPIS = [
    {
      icon: <ShoppingBag className="h-5 w-5" />, label: "Umumiy Savdo",
      primary: formatUZS(kpi.totalSales, { compact: true }), secondary: formatUZS(kpi.totalSales),
      curr: kpi.totalSales, prev: kpiPrev?.totalSales ?? null,
      iconColor: "bg-emerald-500/10 text-emerald-600", higherIsBetter: true,
    },
    {
      icon: <BarChart3 className="h-5 w-5" />, label: "Marja",
      primary: kpi.marja != null ? `${kpi.marja.toFixed(1)}%` : "—", secondary: "sotuv / tannarx",
      curr: kpi.marja ?? 0, prev: kpiPrev?.marja ?? null,
      iconColor: "bg-violet-500/10 text-violet-600", higherIsBetter: true,
    },
    {
      icon: <Users className="h-5 w-5" />, label: "Tashriflar Soni",
      primary: formatNumber(kpi.totalVisits), secondary: `${formatNumber(kpi.totalReceipts)} chek`,
      curr: kpi.totalVisits, prev: kpiPrev?.totalVisits ?? null,
      iconColor: "bg-amber-400/15 text-amber-600", higherIsBetter: true,
    },
    {
      icon: <Receipt className="h-5 w-5" />, label: "O'rtacha Chek",
      primary: formatUZS(kpi.avgReceipt, { compact: true }), secondary: formatUZS(kpi.avgReceipt),
      curr: kpi.avgReceipt, prev: kpiPrev?.avgReceipt ?? null,
      iconColor: "bg-orange-500/10 text-orange-600", higherIsBetter: true,
    },
    {
      icon: <TrendingUp className="h-5 w-5" />, label: "Konversiya",
      primary: formatPercent(kpi.conversion), secondary: "cheklar / tashriflar",
      curr: kpi.conversion, prev: kpiPrev?.conversion ?? null,
      iconColor: "bg-emerald-500/10 text-emerald-600", higherIsBetter: true,
    },
  ];

  return (
    <StaggerList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {KPIS.map((k) => {
        const d = k.prev != null ? calcDelta(k.curr, k.prev) : null;
        return (
          <StaggerItem key={k.label} className="h-full">
            <KpiCard
              icon={k.icon} label={k.label} primary={k.primary} secondary={k.secondary}
              iconColorClass={k.iconColor} delta={d} deltaLabel={cLabel} higherIsBetter={k.higherIsBetter}
            />
          </StaggerItem>
        );
      })}
    </StaggerList>
  );
}

async function ChartsSection({
  startStr, endStr, branchId,
  compare, cstart, cend,
}: {
  startStr: string; endStr: string; branchId?: number;
  compare?: string; cstart?: string; cend?: string;
}) {
  const start = new Date(startStr + "T00:00:00.000Z");
  const end   = new Date(endStr   + "T00:00:00.000Z");
  const range = { start, end };
  const compareMode = compare === "none" ? undefined : compare ?? "mom";
  const compareRange = compareMode ? getCompareRange(range, compareMode, cstart, cend) : null;
  const compareLabel = compareMode ? getCompareLabel(compareMode) : "";

  const [
    dailySales,
    dailyReceipts,
    share,
    top,
    perf,
    prevDailySales,
    prevDailyReceipts,
    prevShare,
    prevTop,
    prevPerf,
  ] = await Promise.all([
    dailySalesSeries(range, branchId),
    dailyReceiptsSeries(range, branchId),
    branchShare(range),
    topCategories(range, branchId, 18),
    branchPerformance(range),
    compareRange ? dailySalesSeries(compareRange, branchId) : Promise.resolve(null),
    compareRange ? dailyReceiptsSeries(compareRange, branchId) : Promise.resolve(null),
    compareRange ? branchShare(compareRange) : Promise.resolve(null),
    compareRange ? topCategories(compareRange, branchId, 18) : Promise.resolve(null),
    compareRange ? branchPerformance(compareRange) : Promise.resolve(null),
  ]);

  const sumValues = (rows: { value: number }[] | null) =>
    rows?.reduce((sum, r) => sum + r.value, 0) ?? null;
  const sumSales = (rows: { sales: number }[] | null) =>
    rows?.reduce((sum, r) => sum + r.sales, 0) ?? null;
  const sumFacts = (rows: { fact: number }[] | null) =>
    rows?.reduce((sum, r) => sum + r.fact, 0) ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ExpandableCard
          title={
            <ChartTitle
              title="Kunlik Savdo Dinamikasi"
              delta={calcDelta(
                dailySales.reduce((sum, r) => sum + r.value, 0),
                sumValues(prevDailySales) ?? 0
              )}
              compareLabel={compareLabel}
            />
          }
          className="xl:col-span-2 rounded-2xl border-none shadow-sm bg-card overflow-hidden"
          headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
          contentClassName={`${CARD_PAD} ${CARD_PB}`}
        >
          <DailySalesChart sales={dailySales} />
        </ExpandableCard>

        <ExpandableCard
          title={
            <ChartTitle
              title="Filiallar Ulushi"
              delta={calcDelta(
                share.reduce((sum, r) => sum + r.sales, 0),
                sumSales(prevShare) ?? 0
              )}
              compareLabel={compareLabel}
            />
          }
          className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
          headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
          contentClassName={`${CARD_PAD} ${CARD_PB}`}
        >
          <BranchShareChart data={share} />
        </ExpandableCard>
      </div>

      <ExpandableCard
        title={
          <ChartTitle
            title="Kunlik Chek Soni Dinamikasi"
            delta={calcDelta(
              dailyReceipts.reduce((sum, r) => sum + r.value, 0),
              sumValues(prevDailyReceipts) ?? 0
            )}
            compareLabel={compareLabel}
          />
        }
        className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
        headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
        contentClassName={`${CARD_PAD} ${CARD_PB}`}
      >
        <DailyReceiptsChart receipts={dailyReceipts} />
      </ExpandableCard>

      <ExpandableCard
        title={
          <ChartTitle
            title="Top Kategoriyalar"
            delta={calcDelta(
              top.reduce((sum, r) => sum + r.fact, 0),
              sumFacts(prevTop) ?? 0
            )}
            compareLabel={compareLabel}
          />
        }
        className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
        headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
        contentClassName={`${CARD_PAD} ${CARD_PB}`}
      >
        <TopCategoriesChart data={top} />
      </ExpandableCard>

      <ExpandableCard
        title={
          <ChartTitle
            title="Filiallar Faoliyati"
            delta={calcDelta(
              perf.reduce((sum, r) => sum + r.sales, 0),
              sumSales(prevPerf) ?? 0
            )}
            compareLabel={compareLabel}
          />
        }
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
                <TableHead className={`${CARD_PAD} text-xs font-medium text-muted-foreground text-right`}>Konversiya</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perf.map((r) => (
                <TableRow key={r.branchId} className="hover:bg-muted/40 transition-colors border-b border-border/30 last:border-0">
                  <TableCell className={`${CARD_PAD} py-3`}>
                    <Link
                      href={{ pathname: `/branches/${r.branchId}`, query: { start: startStr, end: endStr } }}
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
                  <TableCell className={`${CARD_PAD} text-right tabular-nums text-sm text-muted-foreground`}>
                    {formatPercent(r.conversion)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ExpandableCard>
    </div>
  );
}

// ─── Asosiy sahifa (faqat params + branches) ─────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string; end?: string; branchId?: string;
    compare?: string; cstart?: string; cend?: string;
  }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  // Dashboard V1 — faqat ADMIN va CEO (Kategoriya menejeri V2 ko'radi).
  if (session.user.role !== "ADMIN" && session.user.role !== "CEO") redirect("/dashboard-v2");

  const sp  = await searchParams;
  const def = await getDefaultRange();
  const start    = parseDate(sp.start, def.start);
  const end      = parseDate(sp.end,   def.end);
  const branchId = sp.branchId ? Number(sp.branchId) : undefined;
  const startStr = start.toISOString().slice(0, 10);
  const endStr   = end.toISOString().slice(0, 10);

  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={`${startStr} – ${endStr}${branchId ? ` · ${branches.find((b) => b.id === branchId)?.name ?? ""}` : ""}`}
      >
        <a href={`/api/export?start=${startStr}&end=${endStr}${branchId ? `&branchId=${branchId}` : ""}`}>
          <Button variant="outline" size="sm"
            className="rounded-full bg-card border-border/60 hover:bg-secondary gap-2 h-9 px-4 text-sm font-medium shadow-sm">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Excel eksport</span>
            <span className="sm:hidden">Eksport</span>
          </Button>
        </a>
      </PageHeader>

      {/* Period filter — darhol ko'rinadi */}
      <PeriodFilter
        start={startStr} end={endStr} branchId={branchId} branches={branches}
        compare={sp.compare ?? "mom"} cstart={sp.cstart} cend={sp.cend}
      />

      {/* KPI cards — tez (computeKPI cached) */}
      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection
          startStr={startStr} endStr={endStr} branchId={branchId}
          compare={sp.compare} cstart={sp.cstart} cend={sp.cend}
        />
      </Suspense>

      {/* Grafiklar + jadval — sekin, alohida stream */}
      <Suspense fallback={<ChartsSkeleton />}>
        <ChartsSection
          startStr={startStr}
          endStr={endStr}
          branchId={branchId}
          compare={sp.compare}
          cstart={sp.cstart}
          cend={sp.cend}
        />
      </Suspense>
    </div>
  );
}

function ChartTitle({
  title,
  delta,
  compareLabel,
}: {
  title: string;
  delta: number | null;
  compareLabel: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{title}</span>
      {compareLabel && (
        <CompareBadge delta={delta} compareLabel={compareLabel} />
      )}
    </span>
  );
}

function CompareBadge({
  delta,
  compareLabel,
}: {
  delta: number | null;
  compareLabel: string;
}) {
  if (delta == null) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        {compareLabel}: baza yo'q
      </span>
    );
  }

  const growth = delta > 0;
  const decline = delta < 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        growth
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : decline
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {compareLabel}ga nisbatan {Math.abs(delta).toFixed(1)}%{" "}
      {growth ? "o'sish" : decline ? "pasayish" : "o'zgarishsiz"}
    </span>
  );
}

// ─── KPI Card komponenti ──────────────────────────────────────────────────────

function KpiCard({
  icon, label, primary, secondary,
  iconColorClass = "bg-muted text-muted-foreground",
  delta: d, deltaLabel, higherIsBetter,
}: {
  icon: React.ReactNode; label: string; primary: string; secondary?: string;
  iconColorClass?: string; delta?: number | null; deltaLabel?: string; higherIsBetter?: boolean;
}) {
  const good = d != null && (higherIsBetter ? d > 0 : d < 0);
  const bad  = d != null && (higherIsBetter ? d < 0 : d > 0);
  return (
    <Card className="h-full rounded-2xl border-none shadow-sm bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <div className="flex flex-row items-start justify-between gap-2 pb-2 pt-4 sm:pt-5 px-4 sm:px-5">
        <p className="text-xs sm:text-[13px] font-medium text-muted-foreground leading-snug">{label}</p>
        <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${iconColorClass}`}>{icon}</div>
      </div>
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
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
      </div>
    </Card>
  );
}
