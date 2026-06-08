import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { getForecastMonthStatus, getForecastDays, type ForecastDayCell } from "@/lib/forecast";
import { PlanEditor, type Group } from "./plan-editor";

function parseIntOr(v: string | undefined, fallback: number) {
  const n = parseInt(v ?? "");
  return isNaN(n) ? fallback : n;
}

export default async function RejalarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "CEO") {
    redirect("/dashboard-v2");
  }
  const isAdmin = role === "ADMIN";

  const sp = await searchParams;
  const now = new Date();
  const year  = parseIntOr(sp.year,  now.getFullYear());
  const month = Math.min(12, Math.max(1, parseIntOr(sp.month, now.getMonth() + 1)));
  const activeTab = sp.tab === "marja" ? "marja" : sp.tab === "prognoz" ? "prognoz" : "sotuv";

  // Filiallar — har biri alohida ustun bo'ladi
  const branches = await prisma.branch.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  // Iyerarxiya: bo'lim → kategoriya → subkategoriya
  const rawGroups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      categories: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          children: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  const groups: Group[] = rawGroups.map((g) => ({
    id: g.id,
    name: g.name,
    cats: g.categories.map((c) => ({
      id: c.id,
      name: c.name,
      children: c.children,
    })),
  }));

  // Barcha subkategoriya IDlari
  const subCatIds = groups.flatMap((g) =>
    g.cats.flatMap((c) => c.children.map((s) => s.id))
  );

  // Mavjud rejalar — barcha filiallar bo'yicha
  const [salesPlans, marginPlans, forecastStatus, forecastDays] = await Promise.all([
    prisma.salesPlan.findMany({
      where: { year, month, categoryId: { in: subCatIds } },
      select: { categoryId: true, branchId: true, amount: true },
    }),
    prisma.marginPlan.findMany({
      where: { categoryId: { in: subCatIds } },
      select: { categoryId: true, branchId: true, marginPct: true },
    }),
    getForecastMonthStatus(year, month),
    getForecastDays(year, month),
  ]);

  // 2D xaritalar: subkat → filial → qiymat
  const initSalesPlans: Record<number, Record<number, number>> = {};
  for (const p of salesPlans) {
    (initSalesPlans[p.categoryId] ??= {})[p.branchId] = Number(p.amount);
  }
  const initMarginPlans: Record<number, Record<number, number>> = {};
  for (const p of marginPlans) {
    (initMarginPlans[p.categoryId] ??= {})[p.branchId] = Number(p.marginPct);
  }

  // Filial oylik reja jami (Kunlik prognoz tab — yig'indi tekshiruvi uchun)
  const branchPlanTotals: Record<number, number> = {};
  for (const p of salesPlans) {
    branchPlanTotals[p.branchId] = (branchPlanTotals[p.branchId] ?? 0) + Number(p.amount);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="Rejalar"
        description="Sotuv va marja rejalari — barcha filiallar bir jadvalda"
      />

      <PlanEditor
        key={`${year}-${month}`}
        branches={branches}
        groups={groups}
        initSalesPlans={initSalesPlans}
        initMarginPlans={initMarginPlans}
        year={year}
        month={month}
        activeTab={activeTab}
        isAdmin={isAdmin}
        forecastStatus={forecastStatus}
        initForecastDays={forecastDays as Record<number, Record<string, ForecastDayCell>>}
        branchPlanTotals={branchPlanTotals}
      />
    </div>
  );
}
