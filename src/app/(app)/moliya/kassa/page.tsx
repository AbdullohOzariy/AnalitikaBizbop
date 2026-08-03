import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canEnterCash } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { formatUZS, decimalToNumber } from "@/lib/format";
import { Wallet, ArrowDownLeft, ArrowUpRight, ShieldOff } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { KassaClient } from "./kassa-client";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MoliyaKassaPage({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canEnterCash(session.user.roles);
  const sp = await searchParams;

  // Standart davr — joriy oyning boshidan bugungacha (Toshkent).
  const today = nowTashkent();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = parseDateParam(one(sp.from), monthStart)!;
  const to = parseDateParam(one(sp.to), new Date(isoDay(today) + "T00:00:00.000Z"))!;

  const accountId = Number(one(sp.account)) || null;
  const section = one(sp.section) || null;

  const where = {
    businessDate: { gte: from, lte: to },
    ...(accountId ? { accountId } : {}),
    ...(section ? { article: { group: { section: section as "OPERATING" } } } : {}),
  };

  // Modda metama'lumoti bir marta o'qiladi (~68 qator) — KPI shundan hisoblanadi.
  // Bu yondashuv butun jurnalni xotiraga yuklamaydi.
  const [articles, sums, rows, accounts, counterparties, costCenters, userScope] =
    await Promise.all([
      prisma.cashFlowArticle.findMany({
        orderBy: [{ group: { section: "asc" } }, { group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        select: {
          id: true,
          name: true,
          direction: true,
          isNeutral: true,
          isTransfer: true,
          isActive: true,
          group: { select: { name: true, section: true } },
        },
      }),
      prisma.cashTxn.groupBy({
        by: ["articleId", "direction"],
        where,
        _sum: { amount: true },
      }),
      prisma.cashTxn.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 200,
        select: {
          id: true,
          businessDate: true,
          direction: true,
          amount: true,
          note: true,
          source: true,
          isLocked: true,
          transferId: true,
          account: { select: { name: true } },
          article: { select: { name: true, isNeutral: true, group: { select: { section: true } } } },
          counterparty: { select: { name: true } },
          costCenter: { select: { name: true } },
        },
      }),
      prisma.cashAccount.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, kind: true },
      }),
      prisma.counterparty.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      }),
      prisma.costCenter.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, kind: true },
      }),
      prisma.userCashAccount.findMany({
        where: { userId: Number(session.user.id) },
        select: { accountId: true },
      }),
    ]);

  const meta = new Map(articles.map((a) => [a.id, a]));

  // KPI: neytral moddalar HECH QAYERGA qo'shilmaydi — manbadagi 50.8% lik
  // sun'iy shishishning sababi aynan shu edi.
  let opIn = 0;
  let opOut = 0;
  let invOut = 0;
  let finNet = 0;
  let neutral = 0;
  for (const s of sums) {
    const a = meta.get(s.articleId);
    if (!a) continue;
    const amount = decimalToNumber(s._sum.amount);
    if (a.isNeutral) {
      // FAQAT chiqim tomoni: ko'chirish ikki yozuvdan iborat (OUT + IN), ikkalasini
      // qo'shsak summa ikkilanardi (50 mln ko'chirish 100 mln bo'lib ko'rinardi).
      if (s.direction === "OUT") neutral += amount;
      continue;
    }
    const sec = a.group.section;
    if (sec === "OPERATING") {
      if (s.direction === "IN") opIn += amount;
      else opOut += amount;
    } else if (sec === "INVESTING") {
      if (s.direction === "OUT") invOut += amount;
    } else if (sec === "FINANCING") {
      finNet += s.direction === "IN" ? amount : -amount;
    }
  }

  const allowedAccountIds = userScope.map((u) => u.accountId);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Wallet}
        title="Kassa jurnali"
        description="Naqd, bank va plastik bo'yicha pul harakati. Neytral moddalar (inkassa, ko'chirish, obmen) KPI'ga kirmaydi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Operatsion kirim"
          value={formatUZS(opIn, { compact: true })}
          icon={ArrowDownLeft}
          tone="green"
          hint="Savdo tushumi va boshqa daromad"
        />
        <StatCard
          label="Operatsion chiqim"
          value={formatUZS(opOut, { compact: true })}
          icon={ArrowUpRight}
          tone="red"
          hint={`Sof oqim: ${formatUZS(opIn - opOut, { compact: true })}`}
        />
        <StatCard
          label="Investitsion / moliyaviy"
          value={formatUZS(invOut, { compact: true })}
          icon={Wallet}
          tone="blue"
          hint={`Moliyaviy sof: ${formatUZS(finNet, { compact: true })}`}
        />
        <StatCard
          label="Neytral (transfer)"
          value={formatUZS(neutral, { compact: true })}
          icon={ShieldOff}
          tone="violet"
          hint="Xarajat EMAS — ichki ko'chirish"
        />
      </div>

      <KassaClient
        rows={rows.map((r) => ({
          id: r.id,
          businessDate: isoDay(r.businessDate),
          direction: r.direction,
          amount: decimalToNumber(r.amount),
          note: r.note,
          source: r.source,
          isLocked: r.isLocked,
          isTransfer: r.transferId !== null,
          accountName: r.account.name,
          articleName: r.article.name,
          isNeutral: r.article.isNeutral,
          section: r.article.group.section,
          counterpartyName: r.counterparty?.name ?? null,
          costCenterName: r.costCenter?.name ?? null,
        }))}
        articles={articles.map((a) => ({
          id: a.id,
          name: a.name,
          direction: a.direction,
          isNeutral: a.isNeutral,
          isTransfer: a.isTransfer,
          isActive: a.isActive,
          groupName: a.group.name,
          section: a.group.section,
        }))}
        accounts={accounts}
        counterparties={counterparties}
        costCenters={costCenters}
        allowedAccountIds={allowedAccountIds}
        canEdit={canEdit}
        filters={{ from: isoDay(from), to: isoDay(to), account: accountId, section }}
      />
    </div>
  );
}
