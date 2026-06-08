import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier } from "@/lib/roles";
import { branchReport, findMissingDays, getDefaultRange, diffDaysInclusive } from "@/lib/analytics";
import { Table2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page";
import { PeriodFilter } from "./period-filter";
import { ReportTable } from "./report-table";
import { MissingDaysAlert } from "./missing-days-alert";

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
  if (!isAdminTier(session.user.role)) redirect("/dashboard-v2");

  const defaultRange = await getDefaultRange();
  const sp = await searchParams;
  const range = {
    start: parseDate(sp.start, defaultRange.start),
    end:   parseDate(sp.end,   defaultRange.end),
  };

  const startStr = range.start.toISOString().slice(0, 10);
  const endStr   = range.end.toISOString().slice(0, 10);

  const [rows, missing] = await Promise.all([
    branchReport(range),
    findMissingDays(range),
  ]);
  const hasCostAny = rows.some((r) => r.hasCost);
  const totalDays = diffDaysInclusive(range.start, range.end);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Table2}
        title="Hisobot"
        description="Filial bo'yicha to'plangan ko'rsatkichlar — kategoriyalar bilan"
      >
        <PeriodFilter defaultStart={startStr} defaultEnd={endStr} />
      </PageHeader>

      <MissingDaysAlert
        salesDays={missing.sales}
        visitsDays={missing.visits}
        totalDays={totalDays}
      />

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
