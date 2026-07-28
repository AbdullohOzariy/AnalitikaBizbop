import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  computeKPI,
  dailySalesSeries,
  dailyReceiptsSeries,
  dailyVisitsSeries,
  branchShare,
  topCategories,
  branchPerformance,
  getDefaultRange,
} from "@/lib/analytics";
import {
  marjaBreakdown,
  marjaHierarchy,
  kpiByBranch,
  dailySalesByGroup,
  dailyPlanByGroup,
} from "@/lib/analytics-v2";
import { dailyForecastSeries } from "@/lib/forecast";
import { isoDay, parseDateParam } from "@/lib/date";
import { canSeeAnalytics } from "@/lib/roles";
import { scopeSubIds } from "@/lib/scope";
import { formatUZS, formatNumber, formatPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { ExpandableCard } from "@/components/ui/expandable-card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShoppingBag, Users, Receipt, TrendingUp, ArrowRight, Download, BarChart3, LayoutDashboard, Target,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodFilter } from "@/components/common/period-filter";
import {
  DailySalesChart, DailyCountsChart, BranchShareChart, TopCategoriesChart,
} from "@/components/charts";
import {
  MarjaByBranchWidget,
  MarjaHierarchyWidget,
  ConversionWidget,
  SalesShareWidget,
  GroupSalesDynamicsWidget,
} from "./widgets";
import { StaggerList, StaggerItem } from "@/components/motion";

// ─── Yordamchi funksiyalar ────────────────────────────────────────────────────

function shiftDays(d: Date, n: number)   { return new Date(d.getTime() + n * 86400000); }
function shiftMonths(d: Date, n: number) { const r = new Date(d); r.setUTCMonth(r.getUTCMonth() + n); return r; }
function shiftYears(d: Date, n: number)  { const r = new Date(d); r.setUTCFullYear(r.getUTCFullYear() + n); return r; }

type Range = { start: Date; end: Date };

function getCompareRange(
  range: Range,
  compare: string,
  cstart?: string, cend?: string,
): Range | null {
  if (compare === "wow") return { start: shiftDays(range.start, -7),    end: shiftDays(range.end, -7) };
  if (compare === "mom") return { start: shiftMonths(range.start, -1),  end: shiftMonths(range.end, -1) };
  if (compare === "yoy") return { start: shiftYears(range.start, -1),   end: shiftYears(range.end, -1) };
  if (compare === "custom" && cstart && cend) {
    const s = parseDateParam(cstart, range.start)!;
    const e = parseDateParam(cend,   range.end)!;
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

/**
 * Reja bajarilishi = fakt ÷ reja (%).
 * Reja manbasi: qamrovsiz (admin) — ForecastDay (kunlik AI prognoz); kategoriya
 * menejeri (scope) — o'z guruh rejalari yig'indisi (dailyPlanByGroup scoped).
 */
async function planExecution(
  range: Range,
  branchId: number | undefined,
  scope: number[] | null,
): Promise<number | null> {
  const [fact, plan] = await Promise.all([
    dailySalesSeries(range, branchId, scope),
    scope
      ? dailyPlanByGroup(range, branchId, scope).then((p) => p.days.map((d) => d.total))
      : dailyForecastSeries(range, branchId).then((rows) => rows.map((r) => r.value)),
  ]);
  const totalFact = fact.reduce((s, p) => s + p.value, 0);
  const totalPlan = plan.reduce((s, v) => s + v, 0);
  return totalPlan > 0 ? (totalFact / totalPlan) * 100 : null;
}

/** Marja % (vaznli) — marjaBreakdown.byBranch yig'indisidan. */
function weightedMarja(rows: { sales: number; cost: number }[]): number | null {
  const sales = rows.reduce((s, r) => s + r.sales, 0);
  const cost  = rows.reduce((s, r) => s + r.cost, 0);
  return sales > 0 ? ((sales - cost) / sales) * 100 : null;
}

/** Reja bajarilishi ohangi: ≥100% yashil, 90–100% sariq, <90% qizil. */
function execTone(pct: number | null): string {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct >= 100) return "bg-emerald-500/10 text-emerald-600";
  if (pct >= 90)  return "bg-amber-400/15 text-amber-600";
  return "bg-red-500/10 text-red-600";
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
      <Skeleton className="h-[400px] rounded-2xl" />
      <Skeleton className="h-[400px] rounded-2xl" />
      <Skeleton className="h-[400px] rounded-2xl" />
    </div>
  );
}

// ─── Async sub-komponentlar ───────────────────────────────────────────────────

async function KpiSection({
  startStr, endStr, branchId, scope,
  compare, cstart, cend,
}: {
  startStr: string; endStr: string; branchId?: number; scope: number[] | null;
  compare?: string; cstart?: string; cend?: string;
}) {
  const range: Range = {
    start: new Date(startStr + "T00:00:00.000Z"),
    end:   new Date(endStr   + "T00:00:00.000Z"),
  };
  const compareMode = compare === "none" ? undefined : compare ?? "mom";
  const compareRange = compareMode ? getCompareRange(range, compareMode, cstart, cend) : null;
  const cLabel = compareMode ? getCompareLabel(compareMode) : "";
  // Qamrovsiz (admin darajasi) — summa asosidagi kartalar ham ko'rinadi
  const full = scope === null;

  const [marja, marjaPrev, kpiBr, kpiBrPrev, exec, execPrev, kpi, kpiPrev] = await Promise.all([
    marjaBreakdown(range, branchId, scope),
    compareRange ? marjaBreakdown(compareRange, branchId, scope) : Promise.resolve(null),
    kpiByBranch(range),
    compareRange ? kpiByBranch(compareRange) : Promise.resolve(null),
    planExecution(range, branchId, scope),
    compareRange ? planExecution(compareRange, branchId, scope) : Promise.resolve(null),
    full ? computeKPI(range, branchId) : Promise.resolve(null),
    full && compareRange ? computeKPI(compareRange, branchId) : Promise.resolve(null),
  ]);

  // Tashrif/chek — filial darajasidagi neytral metrika (qamrovga bog'liq emas)
  const sumKpi = (rows: typeof kpiBr) =>
    rows
      .filter((r) => branchId == null || r.branchId === branchId)
      .reduce((a, r) => ({ visits: a.visits + r.visits, receipts: a.receipts + r.receipts }), { visits: 0, receipts: 0 });
  const cur  = sumKpi(kpiBr);
  const prev = kpiBrPrev ? sumKpi(kpiBrPrev) : null;
  const conversion     = cur.visits  > 0 ? (cur.receipts  / cur.visits)  * 100 : 0;
  const conversionPrev = prev && prev.visits > 0 ? (prev.receipts / prev.visits) * 100 : null;

  const marjaPct     = weightedMarja(marja.byBranch);
  const marjaPctPrev = marjaPrev ? weightedMarja(marjaPrev.byBranch) : null;

  const hasAnyData =
    cur.visits > 0 || cur.receipts > 0 || marja.byBranch.some((r) => r.sales > 0);

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
      icon: <Target className="h-5 w-5" />, label: "Reja bajarilishi",
      primary: exec != null ? `${exec.toFixed(1)}%` : "—",
      secondary: exec != null ? "fakt ÷ reja" : "reja kiritilmagan",
      curr: exec ?? 0, prev: exec != null ? execPrev : null,
      iconColor: execTone(exec), higherIsBetter: true,
    },
    {
      icon: <BarChart3 className="h-5 w-5" />, label: "Marja",
      primary: marjaPct != null ? `${marjaPct.toFixed(1)}%` : "—", secondary: "sotuv / tannarx",
      curr: marjaPct ?? 0, prev: marjaPctPrev,
      iconColor: "bg-violet-500/10 text-violet-600", higherIsBetter: true,
    },
    {
      icon: <Users className="h-5 w-5" />, label: "Tashriflar Soni",
      primary: formatNumber(cur.visits), secondary: `${formatNumber(cur.receipts)} chek`,
      curr: cur.visits, prev: prev?.visits ?? null,
      iconColor: "bg-amber-400/15 text-amber-600", higherIsBetter: true,
    },
    // O'rtacha chek — summa asosidagi metrika, faqat qamrovsiz rollarda
    ...(full && kpi ? [{
      icon: <Receipt className="h-5 w-5" />, label: "O'rtacha Chek",
      primary: formatUZS(kpi.avgReceipt, { compact: true }), secondary: formatUZS(kpi.avgReceipt),
      curr: kpi.avgReceipt, prev: kpiPrev?.avgReceipt ?? null,
      iconColor: "bg-orange-500/10 text-orange-600", higherIsBetter: true,
    }] : []),
    {
      icon: <TrendingUp className="h-5 w-5" />, label: "Konversiya",
      primary: formatPercent(conversion), secondary: "cheklar / tashriflar",
      curr: conversion, prev: conversionPrev,
      iconColor: "bg-emerald-500/10 text-emerald-600", higherIsBetter: true,
    },
  ];

  return (
    <StaggerList
      className={`grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 ${full ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
    >
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
  startStr, endStr, branchId, scope,
  compare, cstart, cend,
}: {
  startStr: string; endStr: string; branchId?: number; scope: number[] | null;
  compare?: string; cstart?: string; cend?: string;
}) {
  const range: Range = {
    start: new Date(startStr + "T00:00:00.000Z"),
    end:   new Date(endStr   + "T00:00:00.000Z"),
  };
  const compareMode = compare === "none" ? undefined : compare ?? "mom";
  const compareRange = compareMode ? getCompareRange(range, compareMode, cstart, cend) : null;
  const compareLabel = compareMode ? getCompareLabel(compareMode) : "";
  const full = scope === null;

  const [
    // Hamma uchun (qamrov qo'llanadi)
    marja,
    marjaHier,
    kpiBr,
    kpiBrPrev,
    groupSales,
    groupPlan,
    visits,
    receipts,
    prevVisits,
    prevReceipts,
    top,
    prevTop,
    // Faqat qamrovsiz rollar uchun (summa asosidagi bo'limlar)
    dailySales,
    forecast,
    share,
    perf,
    prevDailySales,
    prevShare,
    prevPerf,
  ] = await Promise.all([
    marjaBreakdown(range, branchId, scope),
    marjaHierarchy(range, branchId, scope),
    kpiByBranch(range),
    compareRange ? kpiByBranch(compareRange) : Promise.resolve(null),
    dailySalesByGroup(range, branchId, scope),
    dailyPlanByGroup(range, branchId, scope),
    dailyVisitsSeries(range, branchId),
    dailyReceiptsSeries(range, branchId),
    compareRange ? dailyVisitsSeries(compareRange, branchId) : Promise.resolve(null),
    compareRange ? dailyReceiptsSeries(compareRange, branchId) : Promise.resolve(null),
    topCategories(range, branchId, 18, scope),
    compareRange ? topCategories(compareRange, branchId, 18, scope) : Promise.resolve(null),
    full ? dailySalesSeries(range, branchId) : Promise.resolve(null),
    full ? dailyForecastSeries(range, branchId) : Promise.resolve(null),
    full ? branchShare(range) : Promise.resolve(null),
    full ? branchPerformance(range) : Promise.resolve(null),
    full && compareRange ? dailySalesSeries(compareRange, branchId) : Promise.resolve(null),
    full && compareRange ? branchShare(compareRange) : Promise.resolve(null),
    full && compareRange ? branchPerformance(compareRange) : Promise.resolve(null),
  ]);

  const sumValues = (rows: { value: number }[] | null) =>
    rows?.reduce((sum, r) => sum + r.value, 0) ?? null;
  const sumSales = (rows: { sales: number }[] | null) =>
    rows?.reduce((sum, r) => sum + r.sales, 0) ?? null;
  const sumFacts = (rows: { fact: number }[] | null) =>
    rows?.reduce((sum, r) => sum + r.fact, 0) ?? null;

  // ── Konversiya vidjeti: filial kartalari + o'tgan davrga nisbatan trend ──
  const pickBranch = (rows: typeof kpiBr) =>
    branchId ? rows.filter((r) => r.branchId === branchId) : rows;
  const visibleKpi = pickBranch(kpiBr);
  const prevKpiMap = new Map((kpiBrPrev ?? []).map((r) => [r.branchId, r]));
  const kpiWithTrends = visibleKpi.map((r) => {
    const p = prevKpiMap.get(r.branchId);
    return {
      ...r,
      conversionTrend:
        r.conversion != null && p?.conversion != null && p.conversion !== 0
          ? calcDelta(r.conversion, p.conversion)
          : null,
    };
  });
  const conversionOf = (rows: typeof kpiBr) => {
    const v = rows.reduce((s, r) => s + r.visits, 0);
    return v > 0 ? (rows.reduce((s, r) => s + r.receipts, 0) / v) * 100 : null;
  };
  const curConv  = conversionOf(visibleKpi);
  const prevConv = kpiBrPrev ? conversionOf(pickBranch(kpiBrPrev)) : null;
  const conversionTrend =
    curConv != null && prevConv != null ? calcDelta(curConv, prevConv) : null;

  // Kunlik son (tashrif + chek) davr yig'indisi — grafik bilan bir manbadan
  const curCount = (sumValues(visits) ?? 0) + (sumValues(receipts) ?? 0);
  const prevCount =
    prevVisits || prevReceipts
      ? (sumValues(prevVisits) ?? 0) + (sumValues(prevReceipts) ?? 0)
      : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {full && dailySales && share && (
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
            <DailySalesChart sales={dailySales} forecast={forecast ?? undefined} />
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
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExpandableCard
          title={
            <ChartTitle
              title="Kunlik son: tashrif va chek"
              delta={calcDelta(curCount, prevCount ?? 0)}
              compareLabel={compareLabel}
            />
          }
          className="rounded-2xl border-none shadow-sm bg-card overflow-hidden"
          headerClassName={`${CARD_PT} ${CARD_PAD} pb-3`}
          contentClassName={`${CARD_PAD} ${CARD_PB}`}
        >
          <DailyCountsChart visits={visits} receipts={receipts} />
        </ExpandableCard>

        <ConversionWidget rows={kpiWithTrends} trend={compareLabel ? conversionTrend : null} />

        <MarjaByBranchWidget data={marja.byBranch} />
        <MarjaHierarchyWidget data={marjaHier} />
      </div>

      <SalesShareWidget data={marjaHier} />

      <GroupSalesDynamicsWidget
        days={groupSales.days}
        groups={groupSales.groups}
        planDays={groupPlan.days}
      />

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

      {full && perf && (
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
      )}
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
  // Analitikani ko'ruvchilar (admin tier, CEO, SUPPLYCHAIN, kategoriya menejerlari).
  if (!canSeeAnalytics(session.user.roles)) redirect("/");

  const sp = await searchParams;
  // Parallel — ketma-ket await DB roundtrip'larini zanjirlab yuborardi (waterfall).
  // scope: kategoriya menejeri faqat o'z kategoriyalari savdo/marja/reja ma'lumotini
  // ko'radi (tashrif/chek — do'kon darajasidagi neytral kontekst, qoladi).
  const [def, branches, scope] = await Promise.all([
    getDefaultRange(),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" } }),
    scopeSubIds(Number(session.user.id), session.user.roles),
  ]);
  const start    = parseDateParam(sp.start, def.start)!;
  const end      = parseDateParam(sp.end,   def.end)!;
  const branchId = sp.branchId ? Number(sp.branchId) : undefined;
  const startStr = isoDay(start);
  const endStr   = isoDay(end);
  const full     = scope === null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={`${startStr} – ${endStr}${branchId ? ` · ${branches.find((b) => b.id === branchId)?.name ?? ""}` : ""}`}
      >
        {full && (
          <a href={`/api/export?start=${startStr}&end=${endStr}${branchId ? `&branchId=${branchId}` : ""}`}>
            <Button variant="outline" size="sm"
              className="rounded-full bg-card border-border/60 hover:bg-secondary gap-2 h-9 px-4 text-sm font-medium shadow-sm">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Excel eksport</span>
              <span className="sm:hidden">Eksport</span>
            </Button>
          </a>
        )}
      </PageHeader>

      {/* Period filter — darhol ko'rinadi */}
      <PeriodFilter
        start={startStr} end={endStr} branchId={branchId} branches={branches}
        compare={sp.compare ?? "mom"} cstart={sp.cstart} cend={sp.cend}
      />

      {scope && scope.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Sizga hali kategoriya biriktirilmagan — administrator Foydalanuvchilar bo&apos;limida
          kategoriya tayinlagach, shu yerda o&apos;z bo&apos;limingiz ma&apos;lumotlari ko&apos;rinadi.
        </div>
      ) : (
        <>
          {/* KPI cards — tez (keshlangan) */}
          <Suspense fallback={<KpiSkeleton />}>
            <KpiSection
              startStr={startStr} endStr={endStr} branchId={branchId} scope={scope}
              compare={sp.compare} cstart={sp.cstart} cend={sp.cend}
            />
          </Suspense>

          {/* Grafiklar + jadval — sekin, alohida stream */}
          <Suspense fallback={<ChartsSkeleton />}>
            <ChartsSection
              startStr={startStr}
              endStr={endStr}
              branchId={branchId}
              scope={scope}
              compare={sp.compare}
              cstart={sp.cstart}
              cend={sp.cend}
            />
          </Suspense>
        </>
      )}
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
