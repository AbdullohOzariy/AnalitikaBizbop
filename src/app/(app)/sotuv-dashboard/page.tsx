import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { dailySalesSeries } from "@/lib/analytics";
import { dailyForecastSeries } from "@/lib/forecast";
import { formatUZS } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { DailySalesChart } from "@/components/charts";
import { Target, Wallet, TrendingUp, Scale, CalendarClock } from "lucide-react";
import { SotuvFilter } from "./filter";

function parseIntOr(v: string | undefined, fb: number) {
  const n = parseInt(v ?? "");
  return isNaN(n) ? fb : n;
}

// Bajarilish foiziga qarab rang
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
      <span className={`text-xs font-semibold tabular-nums ${execTone(pct)}`}>
        {pct == null ? "—" : `${pct.toFixed(0)}%`}
      </span>
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
  const role = session.user.role;
  if (!isAdminTier(role) && role !== "CEO") redirect("/dashboard-v2");

  const sp = await searchParams;
  const now = new Date();
  const year = parseIntOr(sp.year, now.getFullYear());
  const month = Math.min(12, Math.max(1, parseIntOr(sp.month, now.getMonth() + 1)));
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const range = { start: monthStart, end: monthEnd };
  const brFilterDM = branchId ? Prisma.sql`AND dm."branchId" = ${branchId}` : Prisma.empty;
  const brFilterSP = branchId ? Prisma.sql`AND sp."branchId" = ${branchId}` : Prisma.empty;
  const brFilterCS = branchId ? Prisma.sql`AND cs."branchId" = ${branchId}` : Prisma.empty;

  const [branches, branchRows, groupRows, dailyActual, dailyForecast] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),

    // Filial bo'yicha reja vs fakt
    prisma.$queryRaw<{ id: number; name: string; plan: number; actual: number }[]>`
      SELECT b.id, b.name,
        COALESCE((SELECT SUM(sp.amount) FROM "SalesPlan" sp
                  WHERE sp."branchId" = b.id AND sp.year = ${year} AND sp.month = ${month}), 0)::float8 AS plan,
        COALESCE((SELECT SUM(dm."receiptTotal") FROM "DailyMetrics" dm
                  WHERE dm."branchId" = b.id AND dm.date BETWEEN ${monthStart}::date AND ${monthEnd}::date), 0)::float8 AS actual
      FROM "Branch" b
      ${branchId ? Prisma.sql`WHERE b.id = ${branchId}` : Prisma.empty}
      ORDER BY b."sortOrder" ASC
    `,

    // Bo'lim bo'yicha reja vs fakt (fakt — CategorySales proratsiyasi)
    prisma.$queryRaw<{ id: number; name: string; plan: number; actual: number }[]>`
      SELECT grp.id, grp.name,
        COALESCE((
          SELECT SUM(sp.amount)
          FROM "SalesPlan" sp
          JOIN "Category" sub ON sub.id = sp."categoryId"
          LEFT JOIN "Category" par ON par.id = sub."parentId"
          WHERE COALESCE(par."groupId", sub."groupId") = grp.id
            AND sp.year = ${year} AND sp.month = ${month} ${brFilterSP}
        ), 0)::float8 AS plan,
        COALESCE((
          SELECT SUM(
            cs.amount::numeric * (
              (LEAST(cs."periodEnd", ${monthEnd}::date) - GREATEST(cs."periodStart", ${monthStart}::date) + 1)::float8
              / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
            )
          )
          FROM "CategorySales" cs
          JOIN "Category" cat ON cat.id = cs."categoryId"
          WHERE cat."groupId" = grp.id AND cat."parentId" IS NULL AND cat."sortOrder" > 0
            AND cs."periodStart" <= ${monthEnd}::date AND cs."periodEnd" >= ${monthStart}::date
            ${brFilterCS}
        ), 0)::float8 AS actual
      FROM "CategoryGroup" grp
      ORDER BY grp."sortOrder" ASC
    `,

    dailySalesSeries(range, branchId),
    dailyForecastSeries(range, branchId),
  ]);
  void brFilterDM;

  const totalPlan = branchRows.reduce((s, b) => s + b.plan, 0);
  const totalActual = branchRows.reduce((s, b) => s + b.actual, 0);
  const execution = totalPlan > 0 ? (totalActual / totalPlan) * 100 : null;
  const diff = totalActual - totalPlan;

  // Oy bo'yicha o'tgan kunlar / qolgan kun (joriy oy bo'lsa)
  const today = new Date();
  const isCurMonth = today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month;
  const daysInMonth = monthEnd.getUTCDate();
  const dayOfMonth = isCurMonth ? today.getUTCDate() : daysInMonth;
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
  const remainingPlan = Math.max(0, totalPlan - totalActual);
  const dailyNeed = remainingDays > 0 ? remainingPlan / remainingDays : 0;

  const hasPlan = totalPlan > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Target}
        title="Sotuv Dashboard"
        description="Reja vs fakt — oylik sotuv bajarilishi"
      >
        <SotuvFilter branches={branches} year={year} month={month} branchId={branchId} />
      </PageHeader>

      {!hasPlan ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">Bu oy uchun reja kiritilmagan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <a href="/rejalar" className="underline underline-offset-2">Rejalar</a> bo&apos;limidan sotuv rejasini kiriting.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI kartalar */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Oylik reja" value={formatUZS(totalPlan, { compact: true })} icon={Wallet} tone="blue" hint={`${formatUZS(totalPlan)} so'm`} />
            <StatCard label="Fakt savdo" value={formatUZS(totalActual, { compact: true })} icon={TrendingUp} tone="green" hint={`${dayOfMonth}/${daysInMonth} kun`} />
            <StatCard
              label="Bajarilish"
              value={execution == null ? "—" : `${execution.toFixed(1)}%`}
              icon={Scale}
              tone={execution != null && execution >= 100 ? "green" : execution != null && execution >= 90 ? "orange" : "red"}
              hint={`${diff >= 0 ? "+" : ""}${formatUZS(diff, { compact: true })} farq`}
            />
            <StatCard
              label="Kunlik kerak"
              value={remainingDays > 0 ? formatUZS(dailyNeed, { compact: true }) : "Yopildi"}
              icon={CalendarClock}
              tone="violet"
              hint={remainingDays > 0 ? `${remainingDays} kun qoldi · reja uchun` : "Oy tugadi"}
            />
          </div>

          {/* Kunlik reja vs fakt */}
          <ExpandableCard
            title="Kunlik reja vs fakt"
            className="rounded-2xl border-none bg-card shadow-sm"
            headerClassName="px-5 pt-5 pb-2"
            contentClassName="px-5 pb-5"
          >
            <DailySalesChart sales={dailyActual} forecast={dailyForecast} />
          </ExpandableCard>

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
                      <TableHead className="text-right w-[160px]">Bajarilish</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branchRows.map((b) => {
                      const pct = b.plan > 0 ? (b.actual / b.plan) * 100 : null;
                      const d = b.actual - b.plan;
                      return (
                        <TableRow key={b.id} className="text-sm">
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatUZS(b.plan, { compact: true })}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatUZS(b.actual, { compact: true })}</TableCell>
                          <TableCell className={`text-right tabular-nums ${d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {d >= 0 ? "+" : ""}{formatUZS(d, { compact: true })}
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

          {/* Bo'lim bo'yicha */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">Bo&apos;limlar bo&apos;yicha</div>
              <div className="overflow-x-auto">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Bo&apos;lim</TableHead>
                      <TableHead className="text-right">Reja</TableHead>
                      <TableHead className="text-right">Fakt</TableHead>
                      <TableHead className="text-right w-[160px]">Bajarilish</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupRows.map((g) => {
                      const pct = g.plan > 0 ? (g.actual / g.plan) * 100 : null;
                      return (
                        <TableRow key={g.id} className="text-sm">
                          <TableCell className="font-medium">{g.name}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatUZS(g.plan, { compact: true })}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatUZS(g.actual, { compact: true })}</TableCell>
                          <TableCell className="text-right"><div className="flex justify-end"><ExecBar pct={pct} /></div></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
