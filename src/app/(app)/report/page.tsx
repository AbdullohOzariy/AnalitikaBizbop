import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { branchReport, getDefaultRange } from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodFilter } from "./period-filter";
import { ReportTable } from "./report-table";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
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
    end:   parseDate(sp.end,   defaultRange.end),
  };

  const startStr = range.start.toISOString().slice(0, 10);
  const endStr   = range.end.toISOString().slice(0, 10);

  const rows = await branchReport(range);
  const hasCostAny = rows.some((r) => r.hasCost);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hisobot</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Filial bo'yicha to'plangan ko'rsatkichlar — kategoriyalar bilan
          </p>
        </div>
        <PeriodFilter defaultStart={startStr} defaultEnd={endStr} />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ReportTable rows={rows} hasCostAny={hasCostAny} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        Period: {startStr} → {endStr}
      </p>
    </div>
  );
}
