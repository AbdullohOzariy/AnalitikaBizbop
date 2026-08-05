import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminTier, canSeeFinance } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { decimalToNumber, formatUZS } from "@/lib/format";
import { Receipt, Banknote, CreditCard, Calculator } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { CheklarClient } from "./cheklar-client";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const LIMIT = 100;

export default async function CheklarPage({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session) redirect("/login");
  // Admin-tier yoki moliyachi: cheklar naqd/plastik ajratishning MANBASI.
  if (!isAdminTier(session.user.roles) && !canSeeFinance(session.user.roles)) redirect("/dashboard");

  const sp = await searchParams;
  const today = nowTashkent();
  const bugun = new Date(isoDay(today) + "T00:00:00.000Z");
  const from = parseDateParam(one(sp.from), new Date(bugun.getTime() - 6 * 86400_000))!;
  const to = parseDateParam(one(sp.to), bugun)!;
  const branchId = Number(one(sp.branch)) || null;
  const kind = one(sp.kind) || null;
  const q = (one(sp.q) || "").trim();

  const where = {
    businessDate: { gte: from, lte: to },
    ...(branchId ? { branchId } : {}),
    ...(kind ? { payments: { some: { kind: kind as "CASH" } } } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q } },
            { card: { contains: q } },
            { cashierName: { contains: q, mode: "insensitive" as const } },
            { lines: { some: { name: { contains: q, mode: "insensitive" as const } } } },
            { lines: { some: { barcode: { contains: q } } } },
          ],
        }
      : {}),
  };

  const [agg, tolovlar, rows, branches, bogliqsiz] = await Promise.all([
    prisma.receipt.aggregate({ where, _count: true, _sum: { totalSum: true } }),
    // Naqd/plastik ajratish — chek emas, TO'LOV darajasida (bir chekda ikkalasi bo'lishi mumkin)
    prisma.receiptPayment.groupBy({
      by: ["kind"],
      where: { receipt: where },
      _sum: { value: true },
      _count: true,
    }),
    prisma.receipt.findMany({
      where,
      orderBy: [{ openAt: "desc" }, { id: "desc" }],
      take: LIMIT,
      select: {
        id: true,
        shop: true,
        pos: true,
        number: true,
        session: true,
        openAt: true,
        businessDate: true,
        type: true,
        status: true,
        card: true,
        cashierName: true,
        qtyPositions: true,
        sum: true,
        sumWithDiscs: true,
        totalSum: true,
        branch: { select: { name: true } },
        payments: { select: { id: true, name: true, kind: true, value: true } },
        lines: {
          orderBy: { lineNo: "asc" },
          select: {
            id: true,
            lineNo: true,
            itemCode: true,
            productId: true,
            name: true,
            barcode: true,
            qty: true,
            storno: true,
            sum: true,
            sumWD: true,
            totalSum: true,
          },
        },
      },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.receipt.count({ where: { ...where, branchId: null } }),
  ]);

  const byKind = new Map(
    tolovlar.map((t) => [t.kind, { summa: decimalToNumber(t._sum.value), soni: t._count }])
  );
  const naqd = byKind.get("CASH")?.summa ?? 0;
  const plastik = byKind.get("CARD")?.summa ?? 0;
  const otkazma = byKind.get("TRANSFER")?.summa ?? 0;
  const boshqa = byKind.get("OTHER")?.summa ?? 0;

  const chekSoni = agg._count;
  const jami = decimalToNumber(agg._sum.totalSum);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Receipt}
        title="Cheklar"
        description="1C dan kelgan kassa cheklari. Naqd/plastik ajratish shu yerdan chiqadi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cheklar"
          value={chekSoni.toLocaleString("uz-UZ")}
          icon={Receipt}
          tone="blue"
          hint={chekSoni > 0 ? `o'rtacha chek ${formatUZS(jami / chekSoni)}` : "davr bo'yicha"}
        />
        <StatCard label="Jami tushum" value={formatUZS(jami, { compact: true })} icon={Calculator} tone="violet" />
        <StatCard
          label="Naqd"
          value={formatUZS(naqd, { compact: true })}
          icon={Banknote}
          tone="green"
          hint={jami > 0 ? `${((naqd / jami) * 100).toFixed(1)}%` : undefined}
        />
        <StatCard
          label="Plastik"
          value={formatUZS(plastik, { compact: true })}
          icon={CreditCard}
          tone="orange"
          hint={jami > 0 ? `${((plastik / jami) * 100).toFixed(1)}%` : undefined}
        />
      </div>

      <CheklarClient
        rows={rows.map((r) => ({
          id: r.id,
          shop: r.shop,
          pos: r.pos,
          number: r.number,
          session: r.session,
          openAt: r.openAt.toISOString(),
          businessDate: isoDay(r.businessDate),
          type: r.type,
          status: r.status,
          card: r.card,
          cashierName: r.cashierName,
          qtyPositions: r.qtyPositions,
          sum: decimalToNumber(r.sum),
          sumWithDiscs: decimalToNumber(r.sumWithDiscs),
          totalSum: decimalToNumber(r.totalSum),
          branchName: r.branch?.name ?? null,
          payments: r.payments.map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            value: decimalToNumber(p.value),
          })),
          lines: r.lines.map((l) => ({
            id: l.id,
            lineNo: l.lineNo,
            itemCode: l.itemCode,
            matched: l.productId != null,
            name: l.name,
            barcode: l.barcode,
            qty: decimalToNumber(l.qty),
            storno: l.storno,
            sum: decimalToNumber(l.sum),
            sumWD: decimalToNumber(l.sumWD),
            totalSum: decimalToNumber(l.totalSum),
          })),
        }))}
        branches={branches}
        filters={{ from: isoDay(from), to: isoDay(to), branch: branchId, kind, q }}
        toliqmi={rows.length < LIMIT}
        bogliqsiz={bogliqsiz}
        tolovlar={{ naqd, plastik, otkazma, boshqa }}
      />
    </div>
  );
}
