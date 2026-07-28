import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeChiqim, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { botConfigured, chiqimDefaultRange } from "@/lib/spisaniya/db";
import { computeWriteoffControl } from "@/lib/spisaniya/writeoff-plan";
import { isoDay, parseDateParam } from "@/lib/date";
import { Target, WifiOff } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/common/page";
import { ChiqimFilter } from "../chiqim-filter";
import { NazoratClient } from "./nazorat-client";

export default async function ChiqimNazoratPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const roles = session.user.roles;
  if (!canSeeChiqim(roles)) redirect("/dashboard");

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={Target}
          title="Reja nazorati"
          description="Chiqim savdoning necha foizini tashkil qilishi — reja va fakt"
        />
        <EmptyState
          icon={WifiOff}
          title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const def = chiqimDefaultRange();
  const startDate = parseDateParam(sp.start) ?? def.start;
  const endDate = parseDateParam(sp.end) ?? def.end;

  // Filial filtri Analitika BRANCH bo'yicha: savdo ProductSales'dan (branchId),
  // chiqim esa bizbop'dan olinadi — computeProfitTree branchId'ni Branch.chiqimFilial
  // nomiga o'zi o'giradi. Shu sabab bu yerda bot filial nomlari EMAS, Branch nomlari.
  const branches = await prisma.branch.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const branch = sp.filial ? branches.find((b) => b.name === sp.filial) : undefined;

  const data = await computeWriteoffControl(
    { start: startDate, end: endDate },
    branch?.id
  );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Target}
        title="Reja nazorati"
        description="Chiqim savdoning necha foizini tashkil qilishi — reja va fakt"
      >
        <ChiqimFilter
          filials={branches.map((b) => b.name)}
          defaultStart={sp.start ?? isoDay(def.start)}
          defaultEnd={sp.end ?? isoDay(def.end)}
          defaultFilial={branch?.name}
          hideTur
          basePath="/chiqim/nazorat"
        />
      </PageHeader>

      <NazoratClient
        key={`${branch?.id ?? "all"}-${isoDay(startDate)}-${isoDay(endDate)}`}
        data={data}
        branchId={branch?.id ?? null}
        branchLabel={branch?.name ?? "Barcha filiallar"}
        isAdmin={isSystemAdmin(roles)}
      />
    </div>
  );
}
