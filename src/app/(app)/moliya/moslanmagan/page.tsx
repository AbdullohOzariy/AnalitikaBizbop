import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canEnterCash } from "@/lib/roles";
import { decimalToNumber } from "@/lib/format";
import { PackageSearch, CircleCheck, CircleAlert } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { MoslanmaganClient } from "./moslanmagan-client";

export const dynamic = "force-dynamic";

export default async function MoliyaMoslanmaganPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canEnterCash(session.user.roles);

  const [rows, accounts, articles, halQilingan] = await Promise.all([
    prisma.unmatchedCashRow.findMany({
      where: { resolvedAt: null },
      orderBy: [{ reason: "asc" }, { rowNo: "asc" }],
      take: 300,
      select: {
        id: true,
        reason: true,
        rowNo: true,
        rawDesk: true,
        rawArticle: true,
        rawDate: true,
        rawPerson: true,
        rawNote: true,
        amountIn: true,
        amountOut: true,
        accountId: true,
      },
    }),
    prisma.cashAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cashFlowArticle.findMany({
      where: { isActive: true },
      orderBy: [{ group: { section: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, name: true, group: { select: { name: true, section: true } } },
    }),
    prisma.unmatchedCashRow.count({ where: { resolvedAt: { not: null } } }),
  ]);

  const bySabab = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        icon={PackageSearch}
        title="Moslanmagan qatorlar"
        description="Import tushunmagan qatorlar. Hech biri yo'qotilmagan — kassa va moddani biriktirsangiz yozuvga aylanadi va biriktirish alias bo'lib eslab qolinadi."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Hal qilinmagan"
          value={String(rows.length)}
          icon={CircleAlert}
          tone={rows.length > 0 ? "orange" : "green"}
        />
        <StatCard
          label="Hal qilingan"
          value={halQilingan.toLocaleString("uz-UZ")}
          icon={CircleCheck}
          tone="green"
        />
        <StatCard
          label="Sabablar"
          value={
            Object.entries(bySabab)
              .map(([k, v]) => `${k}:${v}`)
              .join(" · ") || "—"
          }
          icon={PackageSearch}
          tone="blue"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Moslanmagan qator yo'q"
          description="Import qilingan hamma qator tanildi."
        />
      ) : (
        <MoslanmaganClient
          rows={rows.map((r) => ({
            id: r.id,
            reason: r.reason,
            rowNo: r.rowNo,
            rawDesk: r.rawDesk,
            rawArticle: r.rawArticle,
            rawDate: r.rawDate,
            rawPerson: r.rawPerson,
            rawNote: r.rawNote,
            amountIn: r.amountIn ? decimalToNumber(r.amountIn) : null,
            amountOut: r.amountOut ? decimalToNumber(r.amountOut) : null,
            accountId: r.accountId,
          }))}
          accounts={accounts}
          articles={articles.map((a) => ({
            id: a.id,
            name: a.name,
            groupName: a.group.name,
            section: a.group.section,
          }))}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
