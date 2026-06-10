import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange, dailySalesSeries } from "@/lib/analytics";
import {
  dailyVisitsByBranch,
  dailyReceiptsByBranch,
  marjaBreakdown,
  marjaHierarchy,
  kpiByBranch,
  dailySalesByGroup,
  dailyPlanByGroup,
} from "@/lib/analytics-v2";
import { dailyForecastSeries } from "@/lib/forecast";
import { Sparkles, Target, TrendingUp, Users, ReceiptText } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { formatNumber } from "@/lib/format";
import { FiltersBar } from "./filters";
import {
  CountDynamicsWidget,
  MarjaByBranchWidget,
  MarjaHierarchyWidget,
  ConversionWidget,
  SalesShareWidget,
  GroupSalesDynamicsWidget,
} from "./widgets";

function parseISO(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
}

type BranchSeries = Awaited<ReturnType<typeof dailyReceiptsByBranch>>;

function getPreviousPeriod(range: { start: Date; end: Date }): { start: Date; end: Date } {
  const dayMs = 86_400_000;
  const len = Math.round((range.end.getTime() - range.start.getTime()) / dayMs) + 1;
  const end = new Date(range.start.getTime() - dayMs);
  const start = new Date(end.getTime() - (len - 1) * dayMs);
  return { start, end };
}

function calcDelta(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// Filial bo'yicha kunlik seriyani kunlik JAMI ga aylantirish (label bilan)
function sumSeriesByDay(series: BranchSeries): { date: string; total: number }[] {
  return series.values.map((row) => ({
    date: row.date as string,
    total: series.branches.reduce((s, b) => s + Number(row[`b${b.id}`] ?? 0), 0),
  }));
}
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}.${m[1]}` : iso;
}

function WidgetsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-2xl border border-border bg-card p-5 animate-pulse ${i < 2 ? "min-h-[320px]" : "min-h-[280px]"}`}
        >
          <div className="h-4 w-40 rounded bg-muted mb-4" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
            <div className="h-3 w-4/6 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function WidgetsSection({
  startStr,
  endStr,
  branchId,
}: {
  startStr: string;
  endStr: string;
  branchId: number | undefined;
}) {
  const range = {
    start: new Date(startStr + "T00:00:00.000Z"),
    end: new Date(endStr + "T00:00:00.000Z"),
  };
  const previousRange = getPreviousPeriod(range);

  const [
    visits,
    receipts,
    marja,
    marjaHier,
    kpi,
    prevKpi,
    groupSales,
    groupPlan,
    dailyFact,
    dailyPlan,
  ] = await Promise.all([
    dailyVisitsByBranch(range),
    dailyReceiptsByBranch(range),
    marjaBreakdown(range, branchId),
    marjaHierarchy(range, branchId),
    kpiByBranch(range),
    kpiByBranch(previousRange),
    dailySalesByGroup(range, branchId),
    dailyPlanByGroup(range, branchId),
    dailySalesSeries(range, branchId),
    dailyForecastSeries(range, branchId),
  ]);

  const filterByBranch = (s: typeof visits) =>
    branchId == null ? s : { ...s, branches: s.branches.filter((b) => b.id === branchId) };
  const visibleVisits = filterByBranch(visits);
  const visibleReceipts = filterByBranch(receipts);

  // ── Chek/tashrif KPI (kpiByBranch'dan) + konversiya ──
  const visibleKpi = branchId ? kpi.filter((r) => r.branchId === branchId) : kpi;
  const previousVisibleKpi = branchId ? prevKpi.filter((r) => r.branchId === branchId) : prevKpi;
  const prevKpiMap = new Map(prevKpi.map((r) => [r.branchId, r]));
  const kpiWithTrends = visibleKpi.map((r) => {
    const p = prevKpiMap.get(r.branchId);
    return { ...r, conversionTrend: calcDelta(r.conversion, p?.conversion) };
  });
  const sumKpi = (rows: typeof visibleKpi) =>
    rows.reduce((acc, r) => ({ receipts: acc.receipts + r.receipts, visits: acc.visits + r.visits }), { receipts: 0, visits: 0 });
  const cur = sumKpi(visibleKpi);
  const prev = sumKpi(previousVisibleKpi);
  const totalVisits = cur.visits;
  const totalReceipts = cur.receipts;
  const overallConversion = totalVisits > 0 ? (totalReceipts / totalVisits) * 100 : null;
  const conversionTrend = calcDelta(
    totalVisits > 0 ? (totalReceipts / totalVisits) * 100 : null,
    prev.visits > 0 ? (prev.receipts / prev.visits) * 100 : null
  );
  const countTrend = calcDelta(cur.visits + cur.receipts, prev.visits + prev.receipts);

  // ── Marja % (weighted) ──
  const marjaTotalSales = marja.byBranch.reduce((s, r) => s + r.sales, 0);
  const marjaTotalCost = marja.byBranch.reduce((s, r) => s + r.cost, 0);
  const overallMarja = marjaTotalSales > 0 ? ((marjaTotalSales - marjaTotalCost) / marjaTotalSales) * 100 : null;

  // ── Reja bajarilishi (fakt ÷ reja) — hero KPI uchun ──
  const totalFact = dailyFact.reduce((s, p) => s + p.value, 0);
  const totalPlan = dailyPlan.reduce((s, p) => s + p.value, 0);
  const execution = totalPlan > 0 ? (totalFact / totalPlan) * 100 : null;

  // ── Kunlik son dinamikasi (Tashriflar + Cheklar, jami) ──
  const receiptsByDay = new Map(sumSeriesByDay(visibleReceipts).map((d) => [d.date, d.total]));
  const countDaily = sumSeriesByDay(visibleVisits).map((d) => ({
    label: shortDate(d.date),
    tashrif: d.total,
    chek: receiptsByDay.get(d.date) ?? 0,
  }));

  return (
    <div className="space-y-4">
      {/* KPI Hero — summasiz, faqat dinamika */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Reja bajarilishi"
          value={execution == null ? "—" : `${execution.toFixed(1)}%`}
          icon={Target}
          tone={execution == null ? "default" : execution >= 100 ? "green" : execution >= 90 ? "orange" : "red"}
          hint={execution == null ? "reja yo'q" : "fakt ÷ reja"}
        />
        <StatCard
          label="Marja"
          value={overallMarja != null ? `${overallMarja.toFixed(1)}%` : "—"}
          icon={TrendingUp}
          tone={overallMarja != null && overallMarja >= 30 ? "green" : overallMarja != null && overallMarja >= 15 ? "orange" : "default"}
        />
        <StatCard
          label="Konversiya"
          value={overallConversion != null ? `${overallConversion.toFixed(1)}%` : "—"}
          icon={ReceiptText}
          tone="default"
          hint={totalReceipts > 0 ? `${formatNumber(totalReceipts)} chek` : undefined}
        />
        <StatCard
          label="Tashriflar"
          value={totalVisits > 0 ? formatNumber(totalVisits) : "—"}
          icon={Users}
          tone="blue"
        />
      </div>

      {/* Widgetlar */}
      <div className="grid gap-4 md:grid-cols-2">
        <MarjaByBranchWidget data={marja.byBranch} />
        <MarjaHierarchyWidget data={marjaHier} />
        <CountDynamicsWidget title="Kunlik son: tashrif va chek" data={countDaily} trend={countTrend} />
        <ConversionWidget rows={kpiWithTrends} trend={conversionTrend} />
        <div className="md:col-span-2">
          <SalesShareWidget data={marjaHier} />
        </div>
        <div className="md:col-span-2">
          <GroupSalesDynamicsWidget
            days={groupSales.days}
            groups={groupSales.groups}
            planDays={groupPlan.days}
          />
        </div>
      </div>
    </div>
  );
}

export default async function DashboardV2Page({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; start?: string; end?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const branchId =
    sp.branchId === "all" || !sp.branchId ? undefined : Number(sp.branchId) || undefined;

  const defaultRange = await getDefaultRange();
  const startStr = parseISO(sp.start, defaultRange.start).toISOString().slice(0, 10);
  const endStr = parseISO(sp.end, defaultRange.end).toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Sparkles}
        title="Dashboard v2"
        description="Dinamika — bajarilish, marja, konversiya va kunlik trendlar (summasiz)"
      />

      <FiltersBar
        branches={branches}
        branchId={branchId ?? null}
        start={startStr}
        end={endStr}
      />

      <Suspense fallback={<WidgetsSkeleton />}>
        <WidgetsSection startStr={startStr} endStr={endStr} branchId={branchId} />
      </Suspense>
    </div>
  );
}
