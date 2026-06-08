import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/common/page";
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
  const activeTab = sp.tab === "marja" ? "marja" : "sotuv";

  // Filiallar
  const branches = await prisma.branch.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const defaultBranchId = branches[0]?.id ?? 0;
  const branchId = parseIntOr(sp.branchId, defaultBranchId);

  // Iyerarxiya: bo'lim → kategoriya → subkategoriya
  const rawGroups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      categories: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          children: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true },
          },
        },
        select: {
          id: true,
          name: true,
          children: true,
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

  // Mavjud rejalar
  const [salesPlans, marginPlans] = await Promise.all([
    prisma.salesPlan.findMany({
      where: { branchId, year, month, categoryId: { in: subCatIds } },
      select: { categoryId: true, amount: true },
    }),
    prisma.marginPlan.findMany({
      where: { branchId, categoryId: { in: subCatIds } },
      select: { categoryId: true, marginPct: true },
    }),
  ]);

  const initSalesPlans: Record<number, number> = Object.fromEntries(
    salesPlans.map((p) => [p.categoryId, Number(p.amount)])
  );
  const initMarginPlans: Record<number, number> = Object.fromEntries(
    marginPlans.map((p) => [p.categoryId, Number(p.marginPct)])
  );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="Rejalar"
        description="Sotuv va marja rejalari — subkategoriya × filial bo'yicha"
      />

      <PlanEditor
        key={`${branchId}-${year}-${month}`}
        branches={branches}
        groups={groups}
        initSalesPlans={initSalesPlans}
        initMarginPlans={initMarginPlans}
        branchId={branchId}
        year={year}
        month={month}
        activeTab={activeTab}
        isAdmin={isAdmin}
      />
    </div>
  );
}
