import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import {
  planCompletion,
  dailyVisitsByBranch,
  dailyReceiptsByBranch,
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
  const range = {
    start: parseISO(sp.start, defaultRange.start),
    end: parseISO(sp.end, defaultRange.end),
  };

  const [planStats, visits, receipts, marja, kpi] = await Promise.all([
    planCompletion(range, branchId),
    dailyVisitsByBranch(range),
    dailyReceiptsByBranch(range),
    marjaBreakdown(range, branchId),
    kpiByBranch(range),
  ]);

  // Filial filtri "Barcha" bo'lmaganda 2/3-widget'lar uchun ham filtr — faqat shu filial chiziqlarini ko'rsatish
  const filterByBranch = (s: typeof visits) =>
    branchId == null ? s : { ...s, branches: s.branches.filter((b) => b.id === branchId) };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard v2</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reja bajarilishi va asosiy KPI'lar — filial va davr kesimida
        </p>
      </div>

      <FiltersBar
        branches={branches}
        branchId={branchId ?? null}
        start={range.start.toISOString().slice(0, 10)}
        end={range.end.toISOString().slice(0, 10)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <PlanCompletionWidget data={planStats} />
        <MarjaWidget byCategory={marja.byCategory} byBranch={marja.byBranch} />
        <DailyByBranchWidget title="2. Tashriflar (kunlik)" data={filterByBranch(visits)} />
        <DailyByBranchWidget title="3. Chek soni (kunlik)" data={filterByBranch(receipts)} />
        <ConversionWidget rows={branchId ? kpi.filter((r) => r.branchId === branchId) : kpi} />
        <AvgItemsWidget rows={branchId ? kpi.filter((r) => r.branchId === branchId) : kpi} />
      </div>
    </div>
  );
}
