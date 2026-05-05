import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlansEditor } from "./plans-editor";
import { DailyComparisonView } from "./daily-comparison";
import { dailyPlanVsActual, getDefaultRange } from "@/lib/analytics";

const CURRENT_YEAR = new Date().getUTCFullYear();
const CURRENT_MONTH = new Date().getUTCMonth() + 1;

function parseISO(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    branchId?: string;
    year?: string;
    month?: string;
    start?: string;
    end?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const sp = await searchParams;
  const tab = sp.tab === "daily" ? "daily" : "monthly";
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  const branchId = Number(sp.branchId) || branches[0]?.id;
  const year = Number(sp.year) || CURRENT_YEAR;
  const month = Number(sp.month) || CURRENT_MONTH;

  const plans = branchId
    ? await prisma.monthlyPlan.findMany({ where: { branchId, year, month } })
    : [];
  const planMap = new Map(plans.map((p) => [p.categoryId, Number(p.planAmount)]));

  // Daily comparison data
  const defaultRange = await getDefaultRange();
  const range = {
    start: parseISO(sp.start, defaultRange.start),
    end: parseISO(sp.end, defaultRange.end),
  };
  const dailyRows = branchId ? await dailyPlanVsActual(range, branchId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Normal Reja</h1>
        <p className="text-sm text-muted-foreground">
          Oylik rejani qo'lda kiriting yoki yuklangan kunlik rejalarni real sotuv bilan
          solishtiring.
        </p>
      </div>

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="monthly">Oylik reja</TabsTrigger>
          <TabsTrigger value="daily">Kunlik solishtirish</TabsTrigger>
        </TabsList>
        <TabsContent value="monthly">
          <PlansEditor
            branches={branches}
            categories={categories}
            currentBranchId={branchId}
            currentYear={year}
            currentMonth={month}
            existing={planMap}
          />
        </TabsContent>
        <TabsContent value="daily">
          <DailyComparisonView
            branches={branches}
            branchId={branchId}
            start={range.start.toISOString().slice(0, 10)}
            end={range.end.toISOString().slice(0, 10)}
            rows={dailyRows}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
