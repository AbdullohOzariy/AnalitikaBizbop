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
} from "@/lib/analytics-v2";
import { FiltersBar } from "./filters";
import {
  PlanCompletionWidget,
  DailyByBranchWidget,
  MarjaWidget,
  ConversionWidget,
  AvgItemsWidget,
} from "./widgets";

function parseISO(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
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

  const [planStats, visits, receipts, avgReceipt, marja, kpi] = await Promise.all([
    planCompletion(range, branchId),
    dailyVisitsByBranch(range),
    dailyReceiptsByBranch(range),
    dailyAvgReceiptByBranch(range),
    marjaBreakdown(range, branchId),
    kpiByBranch(range),
  ]);

  const filterByBranch = (s: typeof visits) =>
    branchId == null ? s : { ...s, branches: s.branches.filter((b) => b.id === branchId) };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PlanCompletionWidget data={planStats} />
      <MarjaWidget byCategory={marja.byCategory} byBranch={marja.byBranch} />
      <DailyByBranchWidget title="2. Tashriflar (kunlik)" data={filterByBranch(visits)} />
      <DailyByBranchWidget title="3. Chek soni (kunlik)" data={filterByBranch(receipts)} />
      <DailyByBranchWidget
        title="7. O'rtacha chek (kunlik)"
        data={filterByBranch(avgReceipt)}
        format="uzs-compact"
      />
      <ConversionWidget rows={branchId ? kpi.filter((r) => r.branchId === branchId) : kpi} />
      <AvgItemsWidget rows={branchId ? kpi.filter((r) => r.branchId === branchId) : kpi} />
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard v2</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reja bajarilishi va asosiy KPI&apos;lar — filial va davr kesimida
        </p>
      </div>

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
