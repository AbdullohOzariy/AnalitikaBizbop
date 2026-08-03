import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canEnterCash } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { decimalToNumber, formatUZS } from "@/lib/format";
import { pickOpenings, hisobla } from "@/lib/moliya/qoldiq";
import { CalendarCheck, Lock, AlertTriangle, CircleCheck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { YopishClient } from "./yopish-client";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MoliyaYopishPage({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canEnterCash(session.user.roles);
  const sp = await searchParams;
  const bugun = new Date(isoDay(nowTashkent()) + "T00:00:00.000Z");
  const onDate = parseDateParam(one(sp.sana), bugun)!;

  const [accounts, openings, closes] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    prisma.cashAccountOpening.findMany({ select: { accountId: true, onDate: true, amount: true } }),
    prisma.cashDayClose.findMany({
      where: { onDate },
      select: {
        id: true,
        accountId: true,
        expected: true,
        counted: true,
        diff: true,
        note: true,
        closedAt: true,
        closedBy: { select: { name: true } },
      },
    }),
  ]);

  const picked = pickOpenings(
    openings.map((o) => ({ accountId: o.accountId, onDate: o.onDate, amount: decimalToNumber(o.amount) })),
    onDate
  );

  const sums = await Promise.all(
    accounts.map(async (a) => {
      const from = picked.get(a.id)?.onDate;
      const rows = await prisma.cashTxn.groupBy({
        by: ["direction"],
        where: { accountId: a.id, businessDate: { ...(from ? { gte: from } : {}), lte: onDate } },
        _sum: { amount: true },
      });
      return rows.map((r) => ({
        accountId: a.id,
        direction: r.direction as string,
        amount: decimalToNumber(r._sum.amount),
      }));
    })
  );

  const qoldiqlar = new Map(
    hisobla(accounts.map((a) => a.id), picked, sums.flat()).map((q) => [q.accountId, q])
  );
  const closeByAcc = new Map(closes.map((c) => [c.accountId, c]));

  // Yopilmagan eski kunlar — "3 kassa 5 kundan beri yopilmagan" signali uchun.
  const oxirgiYopilgan = await prisma.cashDayClose.groupBy({
    by: ["accountId"],
    _max: { onDate: true },
  });
  const oxirgi = new Map(oxirgiYopilgan.map((r) => [r.accountId, r._max.onDate]));

  const rows = accounts.map((a) => {
    const q = qoldiqlar.get(a.id)!;
    const c = closeByAcc.get(a.id);
    const last = oxirgi.get(a.id) ?? null;
    const kechikish = last
      ? Math.max(0, Math.round((onDate.getTime() - last.getTime()) / 86400_000) - 1)
      : null;
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      expected: q.qoldiq,
      openingMissing: q.openingMissing,
      close: c
        ? {
            id: c.id,
            expected: decimalToNumber(c.expected),
            counted: decimalToNumber(c.counted),
            diff: decimalToNumber(c.diff),
            note: c.note,
            closedBy: c.closedBy?.name ?? null,
            closedAt: c.closedAt.toISOString(),
          }
        : null,
      lastClosed: last ? isoDay(last) : null,
      kechikish,
    };
  });

  const yopilgan = rows.filter((r) => r.close).length;
  const farqli = rows.filter((r) => r.close && r.close.diff !== 0);
  const farqJami = farqli.reduce((s, r) => s + (r.close?.diff ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarCheck}
        title="Kunlik yopish"
        description="Kun oxirida fizik sanalgan naqd tizim hisobiga mos keldimi. Yopilgan kunga yozuv kiritib bo'lmaydi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Yopilgan"
          value={`${yopilgan} / ${rows.length}`}
          icon={Lock}
          tone={yopilgan === rows.length ? "green" : "orange"}
          hint={isoDay(onDate)}
        />
        <StatCard
          label="Farqli"
          value={String(farqli.length)}
          icon={AlertTriangle}
          tone={farqli.length > 0 ? "red" : "green"}
        />
        <StatCard
          label="Farq jami"
          value={formatUZS(farqJami)}
          icon={AlertTriangle}
          tone={farqJami === 0 ? "green" : farqJami < 0 ? "red" : "orange"}
          hint={farqJami < 0 ? "kamomad" : farqJami > 0 ? "ortiqcha" : "farq yo'q"}
        />
        <StatCard
          label="Kechikkan hisob"
          value={String(rows.filter((r) => (r.kechikish ?? 0) > 0).length)}
          icon={CircleCheck}
          tone={rows.some((r) => (r.kechikish ?? 0) > 2) ? "red" : "green"}
          hint="Bir necha kundan beri yopilmagan"
        />
      </div>

      <YopishClient rows={rows} onDate={isoDay(onDate)} canEdit={canEdit} />
    </div>
  );
}
