import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canManageFinanceRefs } from "@/lib/roles";
import { BookMarked, Layers, ShieldOff, ArrowLeftRight } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { MalumotnomaClient } from "./malumotnoma-client";

export const dynamic = "force-dynamic";

const SECTION_ORDER = ["OPERATING", "INVESTING", "FINANCING", "TECHNICAL"] as const;

export default async function MoliyaMalumotnomaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canManageFinanceRefs(session.user.roles);

  const groups = await prisma.cashFlowGroup.findMany({
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      section: true,
      sortOrder: true,
      articles: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          groupId: true,
          direction: true,
          isNeutral: true,
          isTransfer: true,
          isActive: true,
          note: true,
          aliases: { select: { id: true, alias: true }, orderBy: { alias: "asc" } },
        },
      },
    },
  });

  const sorted = [...groups].sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section as (typeof SECTION_ORDER)[number]) -
        SECTION_ORDER.indexOf(b.section as (typeof SECTION_ORDER)[number]) ||
      a.sortOrder - b.sortOrder
  );

  const articles = sorted.flatMap((g) => g.articles);
  const neutralCount = articles.filter((a) => a.isNeutral).length;
  const transferCount = articles.filter((a) => a.isTransfer).length;
  const reviewCount = articles.filter((a) => a.note).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BookMarked}
        title="Moddalar ma'lumotnomasi"
        description="Pul oqimi moddalari (Статья ДДС) — bo'lim → guruh → modda. «Neytral» bayrog'i shu yerda bir marta qo'yiladi va barcha hisobotga tarqaladi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jami modda" value={String(articles.length)} icon={Layers} tone="blue" />
        <StatCard
          label="Neytral"
          value={String(neutralCount)}
          icon={ShieldOff}
          tone="violet"
          hint="Daromad/xarajat KPI'siga kirmaydi"
        />
        <StatCard
          label="Transfer"
          value={String(transferCount)}
          icon={ArrowLeftRight}
          tone="orange"
          hint="Kiritishda qarshi hisob majburiy"
        />
        <StatCard
          label="Izohli"
          value={String(reviewCount)}
          icon={BookMarked}
          tone={reviewCount > 0 ? "red" : "green"}
          hint={reviewCount > 0 ? "Ko'rib chiqilishi kerak" : "Hammasi tasdiqlangan"}
        />
      </div>

      <MalumotnomaClient groups={sorted} canEdit={canEdit} />
    </div>
  );
}
