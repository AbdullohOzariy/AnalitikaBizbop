import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance } from "@/lib/roles";
import { isoDay, nowTashkent } from "@/lib/date";
import { decimalToNumber } from "@/lib/format";
import { pickOpenings, hisobla } from "@/lib/moliya/qoldiq";
import { signallar, type Signal } from "@/lib/moliya/nazorat";
import {
  ShieldAlert,
  Lock,
  Scale,
  UserCog,
  Wallet,
  CircleAlert,
  CircleCheck,
  ChevronRight,
} from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_ICON = {
  yopilmagan: Lock,
  kamomad: Scale,
  kontragentsiz: CircleAlert,
  podotchyot: UserCog,
  "davr-boshi-yoq": Wallet,
  "manfiy-qoldiq": ShieldAlert,
} as const;

const SEV_TONE: Record<Signal["severity"], string> = {
  yuqori: "border-l-destructive bg-destructive/5",
  orta: "border-l-amber-500 bg-amber-400/5",
  past: "border-l-muted-foreground/40",
};

const SEV_LABEL: Record<Signal["severity"], string> = {
  yuqori: "yuqori",
  orta: "o'rta",
  past: "past",
};

const KUN = 86_400_000;
const DEFAULT_LARGE = 5_000_000;

export default async function MoliyaNazoratPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const bugun = new Date(isoDay(nowTashkent()) + "T00:00:00.000Z");
  const oyOldin = new Date(bugun.getTime() - 30 * KUN);

  const chegaraRow = await prisma.appSetting.findUnique({
    where: { key: "moliya_large_payment_uzs" },
  });
  const chegara = Number(chegaraRow?.value) > 0 ? Number(chegaraRow!.value) : DEFAULT_LARGE;

  const [accounts, openings, oxirgiYopilgan, kamomadlar, yiriklar, hisobdorlar] = await Promise.all([
    prisma.cashAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cashAccountOpening.findMany({ select: { accountId: true, onDate: true, amount: true } }),
    prisma.cashDayClose.groupBy({ by: ["accountId"], _max: { onDate: true } }),
    prisma.cashDayClose.findMany({
      where: { onDate: { gte: oyOldin }, NOT: { diff: 0 } },
      orderBy: { onDate: "desc" },
      take: 20,
      select: { accountId: true, onDate: true, diff: true, account: { select: { name: true } } },
    }),
    prisma.cashTxn.findMany({
      where: {
        businessDate: { gte: oyOldin },
        counterpartyId: null,
        amount: { gte: chegara },
        direction: "OUT",
      },
      orderBy: { businessDate: "desc" },
      take: 20,
      select: {
        id: true,
        businessDate: true,
        amount: true,
        account: { select: { name: true } },
        article: { select: { name: true, isNeutral: true } },
      },
    }),
    prisma.counterparty.findMany({
      where: { kind: "ACCOUNTABLE" },
      select: { id: true, name: true },
    }),
  ]);

  // ── Qoldiqlar ──
  const picked = pickOpenings(
    openings.map((o) => ({ accountId: o.accountId, onDate: o.onDate, amount: decimalToNumber(o.amount) })),
    bugun
  );
  const sums = await Promise.all(
    accounts.map(async (a) => {
      const from = picked.get(a.id)?.onDate;
      const rows = await prisma.cashTxn.groupBy({
        by: ["direction"],
        where: { accountId: a.id, businessDate: { ...(from ? { gte: from } : {}), lte: bugun } },
        _sum: { amount: true },
      });
      return rows.map((r) => ({
        accountId: a.id,
        direction: r.direction as string,
        amount: decimalToNumber(r._sum.amount),
      }));
    })
  );
  const qoldiqlar = hisobla(accounts.map((a) => a.id), picked, sums.flat());
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  // ── Hisobdor shaxs ochiq qoldig'i ──
  const hisobdorIds = hisobdorlar.map((h) => h.id);
  const [hSums, hOxirgi] = await Promise.all([
    hisobdorIds.length
      ? prisma.cashTxn.groupBy({
          by: ["counterpartyId", "direction"],
          where: { counterpartyId: { in: hisobdorIds } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    hisobdorIds.length
      ? prisma.cashTxn.groupBy({
          by: ["counterpartyId"],
          where: { counterpartyId: { in: hisobdorIds } },
          _max: { businessDate: true },
        })
      : Promise.resolve([]),
  ]);
  const berilgan = new Map<number, number>();
  const qaytgan = new Map<number, number>();
  for (const s of hSums) {
    if (s.counterpartyId == null) continue;
    const m = s.direction === "OUT" ? berilgan : qaytgan;
    m.set(s.counterpartyId, (m.get(s.counterpartyId) ?? 0) + decimalToNumber(s._sum.amount));
  }
  const oxirgiHarakat = new Map(hOxirgi.map((r) => [r.counterpartyId!, r._max.businessDate]));

  const yopilmaganList = accounts.map((a) => {
    const last = oxirgiYopilgan.find((r) => r.accountId === a.id)?._max.onDate ?? null;
    const kunlar = last ? Math.max(0, Math.round((bugun.getTime() - last.getTime()) / KUN) - 1) : 999;
    return { accountId: a.id, name: a.name, kunlar };
  });

  const sigs = signallar({
    yopilmagan: yopilmaganList,
    kamomad: kamomadlar.map((k) => ({
      accountId: k.accountId,
      name: k.account.name,
      onDate: isoDay(k.onDate),
      diff: decimalToNumber(k.diff),
    })),
    // Neytral moddalar (inkassa/ko'chirish) kontragentsiz bo'lishi NORMAL — chiqariladi.
    yirikKontragentsiz: yiriklar
      .filter((t) => !t.article.isNeutral)
      .map((t) => ({
        id: t.id,
        onDate: isoDay(t.businessDate),
        accountName: t.account.name,
        articleName: t.article.name,
        amount: decimalToNumber(t.amount),
      })),
    podotchyot: hisobdorlar.map((h) => {
      const last = oxirgiHarakat.get(h.id);
      return {
        id: h.id,
        name: h.name,
        ochiq: (berilgan.get(h.id) ?? 0) - (qaytgan.get(h.id) ?? 0),
        oxirgiKun: last ? Math.round((bugun.getTime() - last.getTime()) / KUN) : null,
      };
    }),
    qoldiqlar: qoldiqlar.map((q) => ({
      accountId: q.accountId,
      name: nameById.get(q.accountId) ?? "—",
      qoldiq: q.qoldiq,
      openingMissing: q.openingMissing,
    })),
  });

  const yuqori = sigs.filter((s) => s.severity === "yuqori").length;
  const orta = sigs.filter((s) => s.severity === "orta").length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShieldAlert}
        title="Nazorat — bugun nimaga e'tibor berish kerak"
        description="Yopilmagan kunlar, kamomad, kontragentsiz yirik to'lov, hisobdor shaxsda qolgan pul va ishonchsiz qoldiqlar."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Yuqori"
          value={String(yuqori)}
          icon={CircleAlert}
          tone={yuqori > 0 ? "red" : "green"}
          hint="Darhol qarash kerak"
        />
        <StatCard label="O'rta" value={String(orta)} icon={ShieldAlert} tone={orta > 0 ? "orange" : "green"} />
        <StatCard
          label="Jami signal"
          value={String(sigs.length)}
          icon={CircleCheck}
          tone={sigs.length === 0 ? "green" : "blue"}
          hint={`Yirik to'lov chegarasi: ${chegara.toLocaleString("uz-UZ")} so'm`}
        />
      </div>

      {sigs.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Signal yo'q"
          description="Barcha kunlar yopilgan, kamomad topilmadi, ochiq qoldiq yo'q."
        />
      ) : (
        <Card>
          <CardContent className="space-y-1.5 py-3">
            {sigs.map((s, i) => {
              const Icon = KIND_ICON[s.kind] ?? ShieldAlert;
              return (
                <Link
                  key={`${s.kind}-${i}`}
                  href={s.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border border-l-4 px-3 py-2.5 transition-colors hover:bg-muted/50",
                    SEV_TONE[s.severity]
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.detail}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {SEV_LABEL[s.severity]}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
