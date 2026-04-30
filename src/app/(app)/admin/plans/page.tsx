import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlansEditor } from "./plans-editor";

const CURRENT_YEAR = new Date().getUTCFullYear();
const CURRENT_MONTH = new Date().getUTCMonth() + 1;

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; year?: string; month?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const sp = await searchParams;
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  const branchId = Number(sp.branchId) || branches[0]?.id;
  const year = Number(sp.year) || CURRENT_YEAR;
  const month = Number(sp.month) || CURRENT_MONTH;

  const plans = branchId
    ? await prisma.monthlyPlan.findMany({
        where: { branchId, year, month },
      })
    : [];
  const planMap = new Map(plans.map((p) => [p.categoryId, Number(p.planAmount)]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Normal Reja</h1>
        <p className="text-sm text-muted-foreground">
          Filial × oy × kategoriya kesimida oylik rejani kiriting. Reja Top Kategoriyalar va Reja
          Bajarilgan Kategoriyalar grafiklari uchun ishlatiladi.
        </p>
      </div>

      <PlansEditor
        branches={branches}
        categories={categories}
        currentBranchId={branchId}
        currentYear={year}
        currentMonth={month}
        existing={planMap}
      />
    </div>
  );
}
