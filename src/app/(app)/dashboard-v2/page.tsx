import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import {
  planCompletion,
  dailyVisitsByBranch,
  dailyReceiptsByBranch,
  dailyAvgReceiptByBranch,
  marjaBreakdown,
  kpiByBranch,
  dailySalesByGroup,
  dailySalesByCategory,
} from "@/lib/analytics-v2";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { FiltersBar } from "./filters";
import {
  PlanCompletionWidget,
  DailyByBranchWidget,
  MarjaByBranchWidget,
  MarjaByCategoryWidget,
  ConversionWidget,
  AvgItemsWidget,
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

function seriesTotal(series: BranchSeries): number {
  return series.values.reduce((sum, row) => {
    return sum + series.branches.reduce((branchSum, branch) => {
      return branchSum + Number(row[`b${branch.id}`] ?? 0);
    }, 0);
  }, 0);
}

function seriesAverage(series: BranchSeries): number | null {
  let sum = 0;
  let count = 0;
  for (const row of series.values) {
    for (const branch of series.branches) {
      const value = Number(row[`b${branch.id}`] ?? 0);
      if (value > 0) {
        sum += value;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : null;
}

function WidgetsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card p-5 animate-pulse"
          style={{ minHeight: i < 2 ? 320 : 280 }}
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
    planStats,
    visits,
    receipts,
    avgReceipt,
    marja,
    kpi,
    prevReceipts,
    prevAvgReceipt,
    prevKpi,
    groupSales,
  ] = await Promise.all([
    planCompletion(range, branchId),
    dailyVisitsByBranch(range),
    dailyReceiptsByBranch(range),
    dailyAvgReceiptByBranch(range),
    marjaBreakdown(range, branchId),
    kpiByBranch(range),
    dailyReceiptsByBranch(previousRange),
    dailyAvgReceiptByBranch(previousRange),
    kpiByBranch(previousRange),
    dailySalesByGroup(range, branchId),
  ]);

  // Har bir guruh uchun kategoriya dinamikasini parallel olish
  const catDataEntries = await Promise.all(
    groupSales.groups.map(async (g) => {
      const data = await dailySalesByCategory(range, g.id, branchId);
      return [g.id, data] as const;
    })
  );
  const categoryDataMap = new Map(catDataEntries);

  const filterByBranch = (s: typeof visits) =>
    branchId == null ? s : { ...s, branches: s.branches.filter((b) => b.id === branchId) };
  const visibleReceipts = filterByBranch(receipts);
  const visiblePrevReceipts = filterByBranch(prevReceipts);
  const visibleAvgReceipt = filterByBranch(avgReceipt);
  const visiblePrevAvgReceipt = filterByBranch(prevAvgReceipt);
  const visibleKpi = branchId ? kpi.filter((r) => r.branchId === branchId) : kpi;
  const previousVisibleKpi = branchId ? prevKpi.filter((r) => r.branchId === branchId) : prevKpi;
  const prevKpiMap = new Map(prevKpi.map((r) => [r.branchId, r]));
  const kpiWithTrends = visibleKpi.map((r) => {
    const prev = prevKpiMap.get(r.branchId);
    return {
      ...r,
      conversionTrend: calcDelta(r.conversion, prev?.conversion),
      avgItemsTrend: calcDelta(r.avgItemsPerReceipt, prev?.avgItemsPerReceipt),
    };
  });
  const sumKpi = (rows: typeof visibleKpi) =>
    rows.reduce(
      (acc, r) => ({
        receipts: acc.receipts + r.receipts,
        visits: acc.visits + r.visits,
        avgItemsSum: acc.avgItemsSum + (r.avgItemsPerReceipt ?? 0) * r.receipts,
      }),
      { receipts: 0, visits: 0, avgItemsSum: 0 }
    );
  const currentKpiTotals = sumKpi(visibleKpi);
  const previousKpiTotals = sumKpi(previousVisibleKpi);
  const conversionTrend = calcDelta(
    currentKpiTotals.visits > 0 ? (currentKpiTotals.receipts / currentKpiTotals.visits) * 100 : null,
    previousKpiTotals.visits > 0 ? (previousKpiTotals.receipts / previousKpiTotals.visits) * 100 : null
  );
  const avgItemsTrend = calcDelta(
    currentKpiTotals.receipts > 0 ? currentKpiTotals.avgItemsSum / currentKpiTotals.receipts : null,
    previousKpiTotals.receipts > 0 ? previousKpiTotals.avgItemsSum / previousKpiTotals.receipts : null
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PlanCompletionWidget data={planStats} />
      <MarjaByBranchWidget data={marja.byBranch} />
      <MarjaByCategoryWidget data={marja.byCategory} />
      <DailyByBranchWidget title="2. Tashriflar (kunlik)" data={filterByBranch(visits)} />
      <DailyByBranchWidget
        title="3. Chek soni (kunlik)"
        data={visibleReceipts}
        trend={calcDelta(seriesTotal(visibleReceipts), seriesTotal(visiblePrevReceipts))}
      />
      <DailyByBranchWidget
        title="7. O'rtacha chek (kunlik)"
        data={visibleAvgReceipt}
        format="uzs-compact"
        trend={calcDelta(seriesAverage(visibleAvgReceipt), seriesAverage(visiblePrevAvgReceipt))}
      />
      <ConversionWidget rows={kpiWithTrends} trend={conversionTrend} />
      <AvgItemsWidget rows={kpiWithTrends} trend={avgItemsTrend} />
      <GroupSalesDynamicsWidget
        days={groupSales.days}
        groups={groupSales.groups}
        categoryDataMap={categoryDataMap}
      />
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
        description="Reja bajarilishi va asosiy KPI'lar — filial va davr kesimida"
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
