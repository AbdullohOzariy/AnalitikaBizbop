import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DailyComparisonView } from "./daily-comparison";
import { dailyPlanVsActual, getDefaultRange } from "@/lib/analytics";

function parseISO(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string;
    start?: string;
    end?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const sp = await searchParams;
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const branchId =
    sp.branchId === "all" || !sp.branchId ? undefined : Number(sp.branchId) || undefined;

  const defaultRange = await getDefaultRange();
  const range = {
    start: parseISO(sp.start, defaultRange.start),
    end: parseISO(sp.end, defaultRange.end),
  };
  const rows = await dailyPlanVsActual(range, branchId);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Target}
        title="Normal Reja"
        description="Yuklangan kunlik rejalarni real sotuv bilan solishtiring. Real sotuv yo'q kunlar bo'sh ko'rsatiladi."
      />

      <DailyComparisonView
        branches={branches}
        branchId={branchId ?? null}
        start={range.start.toISOString().slice(0, 10)}
        end={range.end.toISOString().slice(0, 10)}
        rows={rows}
      />
    </div>
  );
}
