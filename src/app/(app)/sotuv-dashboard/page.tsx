import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier, hasRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { dailySalesSeries } from "@/lib/analytics";
import { marjaBreakdown } from "@/lib/analytics-v2";
import { dailyForecastSeries } from "@/lib/forecast";
import { computeProfitTree } from "@/lib/spisaniya/profit";
import { formatUZS } from "@/lib/format";
import { isoDay, parseDateParam, todayTashkentISO } from "@/lib/date";
import { PageHeader, StatCard } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { DailySalesChart, CumulativeChart } from "@/components/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Wallet, TrendingUp, Scale, Percent, Coins, Gauge } from "lucide-react";
import { SotuvFilter } from "./filter";
import { ProfitTree } from "./profit-tree";

function execTone(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 100) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 90) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
function ExecBar({ pct }: { pct: number | null }) {
  const v = Math.max(0, Math.min(150, pct ?? 0));
  const color = pct == null ? "bg-muted" : pct >= 100 ? "bg-emerald-500" : pct >= 90 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(v / 150) * 100}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${execTone(pct)}`}>{pct == null ? "—" : `${pct.toFixed(0)}%`}</span>
    </div>
  );
}

export default async function SotuvDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const roles = session.user.roles;
  // INVENTORY (inventar xodimi) ham sotuv hisobotini ko'radi (izolatsiya: faqat shu + inventarizatsiya)
  if (!isAdminTier(roles) && !hasRole(roles, "CEO", "SUPPLYCHAIN", "INVENTORY")) redirect("/dashboard-v2");

  const sp = await searchParams;
  const now = new Date();
  const defStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const start = parseDateParam(sp.start) ?? defStart;
  const end = parseDateParam(sp.end) ?? defEnd;
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const oneDay = isoDay(start) === isoDay(end);
  // Bugun (Toshkent UTC+5) — run-rate prognozi uchun.
  const todayStr = todayTashkentISO();

  // Yengil so'rov — shell darhol; og'ir qism Suspense'da oqib keladi
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Target}
        title="Sotuv Dashboard"
        description={oneDay ? `${isoDay(start)} — kunlik` : `${isoDay(start)} – ${isoDay(end)} · ${days} kun`}
      >
        <SotuvFilter branches={branches} start={isoDay(start)} end={isoDay(end)} branchId={branchId} />
      </PageHeader>

      <Suspense
        key={[isoDay(start), isoDay(end), branchId ?? "all"].join("|")}
        fallback={<SotuvSkeleton />}
      >
        <SotuvData startStr={isoDay(start)} endStr={isoDay(end)} branchId={branchId} days={days} todayStr={todayStr} />
      </Suspense>
    </div>
  );
}

function SotuvSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </>
  );
}

// Og'ir qism — barcha hisob-kitoblar (Suspense ichida oqib keladi)
async function SotuvData({
  startStr, endStr, branchId, days, todayStr,
}: {
  startStr: string; endStr: string; branchId?: number; days: number; todayStr: string;
}) {
  const start = new Date(startStr + "T00:00:00.000Z");
  const end = new Date(endStr + "T00:00:00.000Z");
  const range = { start, end };

  const [branchRows, dailyActual, dailyForecast, profit, marjaBd] = await Promise.all([

    // Filial bo'yicha: reja = ForecastDay (tanlangan kunlar) yoki SalesPlan proratsiyasi; fakt = CategorySales (proratsiyalangan)
    prisma.$queryRaw<{ id: number; name: string; plan: number; actual: number }[]>`
      SELECT b.id, b.name,
        COALESCE(
          NULLIF((SELECT SUM(fd.amount) FROM "ForecastDay" fd
                  WHERE fd."branchId" = b.id AND fd.date BETWEEN ${start}::date AND ${end}::date), 0),
          (SELECT SUM(sp.amount
              * GREATEST(0, (LEAST((make_date(sp.year, sp.month, 1) + interval '1 month' - interval '1 day')::date, ${end}::date)
                           - GREATEST(make_date(sp.year, sp.month, 1), ${start}::date) + 1))::float8
              / EXTRACT(day FROM (make_date(sp.year, sp.month, 1) + interval '1 month' - interval '1 day'))::float8)
           FROM "SalesPlan" sp
           WHERE sp."branchId" = b.id
             AND make_date(sp.year, sp.month, 1) <= ${end}::date
             AND (make_date(sp.year, sp.month, 1) + interval '1 month' - interval '1 day')::date >= ${start}::date),
          0
        )::float8 AS plan,
        COALESCE((SELECT SUM(cs."amount"::numeric * (
            (LEAST(cs."periodEnd", ${end}::date) - GREATEST(cs."periodStart", ${start}::date) + 1)::numeric
            / NULLIF((cs."periodEnd" - cs."periodStart" + 1), 0)::numeric))
          FROM "CategorySales" cs
          WHERE cs."branchId" = b.id
            AND cs."periodStart" <= ${end}::date AND cs."periodEnd" >= ${start}::date), 0)::float8 AS actual
      FROM "Branch" b
      ${branchId ? Prisma.sql`WHERE b.id = ${branchId}` : Prisma.empty}
      ORDER BY b."sortOrder" ASC
    `,

    dailySalesSeries(range, branchId),
    dailyForecastSeries(range, branchId),
    computeProfitTree(range, branchId),
    marjaBreakdown(range, branchId),
  ]);
  const marjaByBranch = new Map(marjaBd.byBranch.map((r) => [r.id, r.marja]));

  const totalPlan = branchRows.reduce((s, b) => s + b.plan, 0);
  const totalActual = branchRows.reduce((s, b) => s + b.actual, 0);
  const execution = totalPlan > 0 ? (totalActual / totalPlan) * 100 : null;
  const diff = totalActual - totalPlan;
  const marja = profit.total.sales > 0 ? (profit.total.gross / profit.total.sales) * 100 : null;
  const oneDayInner = startStr === endStr;

  // ── Run-rate: davr hali tugamagan bo'lsa — shu tempda davr oxiri prognozi ──
  // O'tgan kunlar = ma'lumotli kunlar (fakt > 0); prognoz = o'rtacha kunlik × jami kun.
  const periodOngoing = startStr <= todayStr && todayStr <= endStr && totalPlan > 0;
  let projPct: number | null = null;
  let requiredDaily: number | null = null;
  let remainingDays = 0;
  if (periodOngoing) {
    const elapsedWithData = dailyActual.filter((d) => d.date < todayStr && d.value > 0).length;
    remainingDays = Math.max(0, Math.round((end.getTime() - new Date(todayStr + "T00:00:00.000Z").getTime()) / 86_400_000) + 1);
    if (elapsedWithData >= 3) {
      const avgDaily = totalActual / elapsedWithData;
      const projected = totalActual + avgDaily * remainingDays;
      projPct = totalPlan > 0 ? (projected / totalPlan) * 100 : null;
    }
    if (remainingDays > 0 && totalActual < totalPlan) {
      requiredDaily = (totalPlan - totalActual) / remainingDays;
    }
  }

  return (
    <>
      {/* KPI kartalar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Reja (davr)" value={formatUZS(totalPlan, { compact: true })} icon={Wallet} tone="blue" hint={`${formatUZS(totalPlan)} so'm`} />
        <StatCard label="Fakt savdo" value={formatUZS(totalActual, { compact: true })} icon={TrendingUp} tone="green" hint={`${days} kun`} />
        <StatCard
          label="Bajarilish"
          value={execution == null ? "—" : `${execution.toFixed(1)}%`}
          icon={Scale}
          tone={execution != null && execution >= 100 ? "green" : execution != null && execution >= 90 ? "orange" : "red"}
          hint={projPct != null ? `davr oxiri prognozi ≈ ${projPct.toFixed(0)}%` : `${diff >= 0 ? "+" : ""}${formatUZS(diff, { compact: true })} farq`}
        />
        <StatCard label="Marja" value={marja == null ? "—" : `${marja.toFixed(1)}%`} icon={Percent} tone="violet" hint="sotuv / tannarx" />
        <StatCard label="Foyda" value={formatUZS(profit.total.net, { compact: true })} icon={Coins} tone={profit.total.net >= 0 ? "green" : "red"} hint="sotuv − tannarx − chiqim" />
      </div>

      {/* Run-rate signal: orqada qolayotgan bo'lsa — qolgan kunlarda kerakli temp */}
      {periodOngoing && requiredDaily != null && projPct != null && projPct < 100 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <Gauge className="h-4 w-4 shrink-0" />
          <span>
            Shu tempda davr oxiri ≈ <b>{projPct.toFixed(0)}%</b>. Rejaga yetish uchun qolgan{" "}
            <b>{remainingDays} kun</b>da kuniga o'rtacha <b>{formatUZS(requiredDaily, { compact: true })}</b> savdo kerak
            (hozirgi o'rtacha: {formatUZS(totalActual / Math.max(1, dailyActual.filter((d) => d.date < todayStr && d.value > 0).length), { compact: true })}).
          </span>
        </div>
      )}
      {periodOngoing && projPct != null && projPct >= 100 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-800 dark:text-emerald-300">
          <Gauge className="h-4 w-4 shrink-0" />
          <span>Shu tempda davr oxiri ≈ <b>{projPct.toFixed(0)}%</b> — reja bajariladi. Davom eting!</span>
        </div>
      )}

      {totalPlan === 0 && (
        <p className="text-xs text-muted-foreground">
          ⓘ Bu davr uchun reja topilmadi. <a href="/rejalar" className="underline underline-offset-2">Rejalar</a> bo&apos;limidan kiriting va prognoz yarating.
        </p>
      )}

      {/* Kunlik reja vs fakt */}
      <ExpandableCard
        title="Kunlik reja vs fakt"
        className="rounded-2xl border-none bg-card shadow-sm"
        headerClassName="px-5 pt-5 pb-2"
        contentClassName="px-5 pb-5"
      >
        <DailySalesChart sales={dailyActual} forecast={dailyForecast} />
      </ExpandableCard>

      {/* Kumulyativ S-egri: qayerdan orqada qola boshladik */}
      {!oneDayInner && dailyForecast.length > 0 && (
        <ExpandableCard
          title="Yig'ilgan reja vs fakt (kumulyativ)"
          className="rounded-2xl border-none bg-card shadow-sm"
          headerClassName="px-5 pt-5 pb-2"
          contentClassName="px-5 pb-5"
        >
          <CumulativeChart actual={dailyActual} plan={dailyForecast} />
        </ExpandableCard>
      )}

      {/* Filial bo'yicha */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">Filiallar bo&apos;yicha</div>
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Filial</TableHead>
                  <TableHead className="text-right">Reja</TableHead>
                  <TableHead className="text-right">Fakt</TableHead>
                  <TableHead className="text-right">Farq</TableHead>
                  <TableHead className="text-right w-[90px]">Marja</TableHead>
                  <TableHead className="text-right w-[160px]">Bajarilish</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchRows.map((b) => {
                  const pct = b.plan > 0 ? (b.actual / b.plan) * 100 : null;
                  const d = b.actual - b.plan;
                  return (
                    <TableRow key={b.id} className="text-sm">
                      <TableCell className="font-medium">
                        <Link href={`/branches/${b.id}`} className="hover:underline">{b.name}</Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatUZS(b.plan, { compact: true })}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatUZS(b.actual, { compact: true })}</TableCell>
                      <TableCell className={`text-right tabular-nums ${d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {d >= 0 ? "+" : ""}{formatUZS(d, { compact: true })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {(() => {
                          const m = marjaByBranch.get(b.id);
                          if (m == null) return <span className="text-muted-foreground">—</span>;
                          const cls = m >= 30 ? "text-emerald-600 dark:text-emerald-400" : m >= 15 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                          return <span className={`font-semibold ${cls}`}>{m.toFixed(1)}%</span>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right"><div className="flex justify-end"><ExecBar pct={pct} /></div></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Foyda (Iyerarxiya bo'yicha) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold">Foyda — Iyerarxiya bo&apos;yicha</h3>
            <span className="text-xs text-muted-foreground">(sotuv − tannarx − chiqim{branchId ? "" : " · barcha filiallar"})</span>
          </div>
          <span className="rounded-lg bg-emerald-500/10 px-3 py-1 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            Jami foyda: {formatUZS(profit.total.net, { compact: true })}
          </span>
        </div>
        <ProfitTree tree={profit} />
      </div>
    </>
  );
}
