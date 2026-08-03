import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canEnterCash } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { decimalToNumber, formatUZS } from "@/lib/format";
import { pickOpenings, hisobla, ishonchli } from "@/lib/moliya/qoldiq";
import { Coins, Wallet, AlertTriangle, ShieldCheck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { QoldiqClient } from "./qoldiq-client";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MoliyaQoldiqPage({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canEnterCash(session.user.roles);
  const sp = await searchParams;
  const bugun = new Date(isoDay(nowTashkent()) + "T00:00:00.000Z");
  const asOf = parseDateParam(one(sp.sana), bugun)!;

  const [accounts, openings] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, kind: true, trustedFrom: true, branch: { select: { name: true } } },
    }),
    prisma.cashAccountOpening.findMany({
      orderBy: { onDate: "desc" },
      select: { id: true, accountId: true, onDate: true, amount: true, note: true },
    }),
  ]);

  const opRows = openings.map((o) => ({
    accountId: o.accountId,
    onDate: o.onDate,
    amount: decimalToNumber(o.amount),
  }));
  const picked = pickOpenings(opRows, asOf);

  // Har hisob uchun yozuvlar O'Z davr boshidan boshlab yig'iladi. Davr boshi
  // yo'q hisoblarda — boshidan (shuning uchun openingMissing bayrog'i muhim).
  const sums = await Promise.all(
    accounts.map(async (a) => {
      const from = picked.get(a.id)?.onDate;
      const rows = await prisma.cashTxn.groupBy({
        by: ["direction"],
        where: {
          accountId: a.id,
          businessDate: { ...(from ? { gte: from } : {}), lte: asOf },
        },
        _sum: { amount: true },
      });
      return rows.map((r) => ({
        accountId: a.id,
        direction: r.direction as string,
        amount: decimalToNumber(r._sum.amount),
      }));
    })
  );

  const qoldiqlar = hisobla(
    accounts.map((a) => a.id),
    picked,
    sums.flat()
  );

  const byId = new Map(qoldiqlar.map((q) => [q.accountId, q]));
  const rows = accounts.map((a) => {
    const q = byId.get(a.id)!;
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      branchName: a.branch?.name ?? null,
      trustedFrom: a.trustedFrom ? isoDay(a.trustedFrom) : null,
      openingDate: q.openingDate ? isoDay(q.openingDate) : null,
      opening: q.opening,
      kirim: q.kirim,
      chiqim: q.chiqim,
      qoldiq: q.qoldiq,
      openingMissing: q.openingMissing,
      trusted: ishonchli(q, a.trustedFrom, asOf),
      history: openings
        .filter((o) => o.accountId === a.id)
        .map((o) => ({
          id: o.id,
          onDate: isoDay(o.onDate),
          amount: decimalToNumber(o.amount),
          note: o.note,
        })),
    };
  });

  const jami = rows.reduce((s, r) => s + r.qoldiq, 0);
  const manfiy = rows.filter((r) => r.qoldiq < 0).length;
  const ishonchsiz = rows.filter((r) => !r.trusted).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Coins}
        title="Kassa qoldiqlari"
        description="Qoldiq hech qachon saqlanmaydi — davr boshi (fizik sanash) + yozuvlardan har safar qayta hisoblanadi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Jami qoldiq"
          value={formatUZS(jami, { compact: true })}
          icon={Wallet}
          tone={jami < 0 ? "red" : "green"}
          hint={`${isoDay(asOf)} holatiga`}
        />
        <StatCard label="Hisoblar" value={String(rows.length)} icon={Coins} tone="blue" />
        <StatCard
          label="Manfiy qoldiq"
          value={String(manfiy)}
          icon={AlertTriangle}
          tone={manfiy > 0 ? "red" : "green"}
          hint={manfiy > 0 ? "Naqd manfiy bo'lishi mumkin emas" : "Hammasi musbat"}
        />
        <StatCard
          label="Tasdiqlanmagan"
          value={String(ishonchsiz)}
          icon={ShieldCheck}
          tone={ishonchsiz > 0 ? "orange" : "green"}
          hint="Fizik sanash kiritilmagan"
        />
      </div>

      <QoldiqClient rows={rows} asOf={isoDay(asOf)} canEdit={canEdit} />
    </div>
  );
}
