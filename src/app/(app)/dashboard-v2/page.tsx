import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import {
  dailyVisitsByBranch,
  marjaBreakdown,
  dailySalesByGroup,
  dailySalesByCategory,
} from "@/lib/analytics-v2";
import { Sparkles, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { formatUZS, formatNumber } from "@/lib/format";
import { FiltersBar } from "./filters";
import {
  DailyByBranchWidget,
  MarjaByBranchWidget,
  MarjaByCategoryWidget,
  GroupSalesDynamicsWidget,
} from "./widgets";

function parseISO(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
}

type BranchSeries = Awaited<ReturnType<typeof dailyVisitsByBranch>>;

function seriesTotal(series: BranchSeries): number {
  return series.values.reduce((sum, row) => {
    return sum + series.branches.reduce((branchSum, branch) => {
      return branchSum + Number(row[`b${branch.id}`] ?? 0);
    }, 0);
  }, 0);
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

  const [visits, marja, groupSales] = await Promise.all([
    dailyVisitsByBranch(range),
    marjaBreakdown(range, branchId),
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

  // ── KPI hero row uchun jami hisoblar ──────────────────────────────
  const totalSales = groupSales.days.reduce((s, d) => s + d.total, 0);
  const marjaTotalSales = marja.byBranch.reduce((s, r) => s + r.sales, 0);
  const marjaTotalCost  = marja.byBranch.reduce((s, r) => s + r.cost, 0);
  const overallMarja    = marjaTotalSales > 0
    ? ((marjaTotalSales - marjaTotalCost) / marjaTotalSales) * 100
    : null;
  const totalVisits = seriesTotal(filterByBranch(visits));

  return (
    <div className="space-y-4">
      {/* KPI Hero qatori */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Umumiy savdo"
          value={totalSales > 0 ? formatUZS(totalSales, { compact: true }) : "—"}
          icon={ShoppingCart}
          tone="green"
        />
        <StatCard
          label="Marja"
          value={overallMarja != null ? `${overallMarja.toFixed(1)}%` : "—"}
          icon={TrendingUp}
          tone={overallMarja != null && overallMarja >= 30 ? "green" : overallMarja != null && overallMarja >= 15 ? "orange" : "default"}
        />
        <StatCard
          label="Tashriflar"
          value={totalVisits > 0 ? formatNumber(totalVisits) : "—"}
          icon={Users}
          tone="blue"
        />
      </div>

      {/* Widgetlar gridi */}
      <div className="grid gap-4 md:grid-cols-2">
        <MarjaByBranchWidget data={marja.byBranch} />
        <MarjaByCategoryWidget data={marja.byCategory} />
        <DailyByBranchWidget title="Tashriflar (kunlik)" data={filterByBranch(visits)} />
        <GroupSalesDynamicsWidget
          days={groupSales.days}
          groups={groupSales.groups}
          categoryDataMap={categoryDataMap}
        />
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
        description="Asosiy KPI'lar — filial va davr kesimida"
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
