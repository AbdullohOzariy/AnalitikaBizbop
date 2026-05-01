import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { branchReport, getDefaultRange } from "@/lib/analytics";
import { formatUZS, formatNumber, formatPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PeriodFilter } from "./period-filter";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
}

function pct(val: number | null): string {
  if (val == null) return "—";
  return `${val.toFixed(1)}%`;
}

function planBadge(p: number) {
  if (p === 0) return "";
  if (p >= 100) return "text-[oklch(0.55_0.15_134)] font-semibold";
  if (p >= 80) return "text-amber-600 font-medium";
  return "text-red-500";
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const defaultRange = await getDefaultRange();
  const sp = await searchParams;
  const range = {
    start: parseDate(sp.start, defaultRange.start),
    end: parseDate(sp.end, defaultRange.end),
  };

  const startStr = range.start.toISOString().slice(0, 10);
  const endStr = range.end.toISOString().slice(0, 10);

  const rows = await branchReport(range);

  // Jami qatorini hisoblash
  const hasCostAny = rows.some((r) => r.hasCost);
  const total = rows.reduce(
    (acc, r) => ({
      sales: acc.sales + r.sales,
      cost: acc.cost + r.cost,
      receipts: acc.receipts + r.receipts,
      receiptTotal: acc.receiptTotal + r.receiptTotal,
      visits: acc.visits + r.visits,
      plan: acc.plan + r.plan,
    }),
    { sales: 0, cost: 0, receipts: 0, receiptTotal: 0, visits: 0, plan: 0 }
  );
  const totalMarja =
    hasCostAny && total.cost > 0
      ? ((total.sales - total.cost) / total.cost) * 100
      : null;
  const totalAvgReceipt =
    total.receipts > 0 ? total.receiptTotal / total.receipts : 0;
  const totalConversion =
    total.visits > 0 ? (total.receipts / total.visits) * 100 : 0;
  const totalPlanPct =
    total.plan > 0 ? (total.sales / total.plan) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Sarlavha + filter */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hisobot</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Filial bo'yicha to'plangan ko'rsatkichlar — bir joyda
          </p>
        </div>
        <PeriodFilter defaultStart={startStr} defaultEnd={endStr} />
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-5 sticky left-0 bg-muted/40 z-10 min-w-[140px]">
                    Filial
                  </TableHead>
                  <TableHead className="text-right">Sotuv</TableHead>
                  {hasCostAny && (
                    <>
                      <TableHead className="text-right">Tannarx</TableHead>
                      <TableHead className="text-right">Marja %</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">Cheklar</TableHead>
                  <TableHead className="text-right">Chek summasi</TableHead>
                  <TableHead className="text-right">O'rt. chek</TableHead>
                  <TableHead className="text-right">Tashriflar</TableHead>
                  <TableHead className="text-right">Konv. %</TableHead>
                  <TableHead className="text-right">Reja</TableHead>
                  <TableHead className="text-right pr-5">Baj. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.branchId}>
                    <TableCell className="pl-5 font-semibold sticky left-0 bg-card z-10">
                      {r.branchName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.sales > 0 ? formatUZS(r.sales) : "—"}
                    </TableCell>
                    {hasCostAny && (
                      <>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.hasCost ? formatUZS(r.cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.marja != null ? (
                            <span
                              className={
                                r.marja >= 30
                                  ? "text-[oklch(0.55_0.15_134)] font-medium"
                                  : r.marja >= 15
                                  ? "text-amber-600"
                                  : "text-red-500"
                              }
                            >
                              {pct(r.marja)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {r.receipts > 0 ? formatNumber(r.receipts) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.receiptTotal > 0 ? formatUZS(r.receiptTotal) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.avgReceipt > 0 ? formatUZS(r.avgReceipt) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.visits > 0 ? formatNumber(r.visits) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.visits > 0 ? pct(r.conversion) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.plan > 0 ? formatUZS(r.plan) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums pr-5 ${planBadge(r.planPct)}`}>
                      {r.plan > 0 ? pct(r.planPct) : "—"}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Jami */}
                <TableRow className="border-t-2 bg-muted/30 hover:bg-muted/30 font-semibold">
                  <TableCell className="pl-5 sticky left-0 bg-muted/30 z-10">
                    Jami
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total.sales > 0 ? formatUZS(total.sales) : "—"}
                  </TableCell>
                  {hasCostAny && (
                    <>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {total.cost > 0 ? formatUZS(total.cost) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totalMarja != null ? pct(totalMarja) : "—"}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {total.receipts > 0 ? formatNumber(total.receipts) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total.receiptTotal > 0 ? formatUZS(total.receiptTotal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalAvgReceipt > 0 ? formatUZS(totalAvgReceipt) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total.visits > 0 ? formatNumber(total.visits) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total.visits > 0 ? pct(totalConversion) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {total.plan > 0 ? formatUZS(total.plan) : "—"}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums pr-5 ${planBadge(totalPlanPct)}`}>
                    {total.plan > 0 ? pct(totalPlanPct) : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Period ko'rsatkichi */}
      <p className="text-xs text-muted-foreground text-right">
        Period: {startStr} → {endStr}
      </p>
    </div>
  );
}
