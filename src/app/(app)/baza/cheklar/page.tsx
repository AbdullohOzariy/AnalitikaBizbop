import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminTier, canSeeFinance } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { decimalToNumber, formatUZS } from "@/lib/format";
import {
  Receipt,
  Banknote,
  Calculator,
  ShoppingBasket,
  Timer,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { CheklarClient } from "./cheklar-client";
import { ChekAnalitika } from "./chek-analitika";
import {
  tolovTurlari as tolovTurlariRoyxat,
  turXaritasi,
  toneOf,
} from "@/lib/integratsiya/tolov-turlari";
import {
  chekKpi,
  soatlikOqim,
  kassirKesimi,
  kassaKesimi,
  chekIdlari,
  tolovTaqsimoti,
  kassirRoyxati,
  kassaRoyxati,
  type ChekFiltr,
} from "@/lib/integratsiya/chek-analitika";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const son = (v: string | string[] | undefined): number | null => {
  const s = one(v);
  return s != null && s !== "" && /^-?\d+$/.test(s) ? Number(s) : null;
};
const soat = (v: string | string[] | undefined): number | null => {
  const n = son(v);
  return n != null && n >= 0 && n <= 23 ? n : null;
};

const LIMIT = 100;

export default async function CheklarPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  // Admin-tier yoki moliyachi: cheklar naqd/plastik ajratishning MANBASI.
  if (!isAdminTier(session.user.roles) && !canSeeFinance(session.user.roles)) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const today = nowTashkent();
  const bugun = new Date(isoDay(today) + "T00:00:00.000Z");
  const from = parseDateParam(
    one(sp.from),
    new Date(bugun.getTime() - 6 * 86400_000),
  )!;
  const to = parseDateParam(one(sp.to), bugun)!;

  const f: ChekFiltr = {
    from: isoDay(from),
    to: isoDay(to),
    branchId: son(sp.branch),
    kassa: one(sp.kassa) || null,
    cashierId: son(sp.kassir),
    kind: one(sp.kind) || null,
    soatDan: soat(sp.soatDan),
    soatGacha: soat(sp.soatGacha),
    q: (one(sp.q) || "").trim(),
    storno: one(sp.storno) === "1",
    skuYoq: one(sp.skuYoq) === "1",
  };

  const [
    kpi,
    soatlar,
    kassirlar,
    kassalar,
    idlar,
    byKind,
    kindDefs,
    branches,
    kassirOpts,
    kassaOpts,
  ] = await Promise.all([
    chekKpi(f),
    soatlikOqim(f),
    kassirKesimi(f),
    kassaKesimi(f),
    chekIdlari(f, LIMIT),
    tolovTaqsimoti(f),
    tolovTurlariRoyxat(),
    prisma.branch.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    kassirRoyxati(f),
    kassaRoyxati(f),
  ]);

  const rows = idlar.ids.length
    ? await prisma.receipt.findMany({
        where: { id: { in: idlar.ids } },
        orderBy: [{ openAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          shop: true,
          pos: true,
          number: true,
          session: true,
          openAt: true,
          closeAt: true,
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
          payments: {
            select: { id: true, name: true, kind: true, value: true },
          },
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
      })
    : [];

  const bogliqsiz = await prisma.receipt.count({
    where: { businessDate: { gte: from, lte: to }, branchId: null },
  });

  const tur = turXaritasi(kindDefs);
  const kodlar = [
    ...new Set([...kindDefs.map((k) => k.code), ...byKind.keys()]),
  ];
  const taqsimot = kodlar
    .map((code) => ({
      code,
      name: tur(code).name,
      pill: toneOf(tur(code).tone).pill,
      bar: toneOf(tur(code).tone).bar,
      summa: byKind.get(code) ?? 0,
      sortOrder: tur(code).sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const vaqt = (s: number | null) =>
    s == null
      ? "—"
      : s >= 60
        ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
        : `${Math.round(s)}s`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Receipt}
        title="Cheklar"
        description="1C dan kelgan kassa cheklari. Bu bo'lim mustaqil — boshqa hisobotlarga ta'sir qilmaydi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Cheklar"
          value={kpi.cheklar.toLocaleString("uz-UZ")}
          icon={Receipt}
          tone="blue"
        />
        <StatCard
          label="Jami tushum"
          value={formatUZS(kpi.tushum, { compact: true })}
          icon={Calculator}
          tone="violet"
        />
        <StatCard
          label="O'rtacha chek"
          value={formatUZS(kpi.ortChek, { compact: true })}
          icon={Calculator}
          tone="violet"
        />
        <StatCard
          label="Chekdagi tovar"
          value={kpi.ortTur.toFixed(1)}
          icon={ShoppingBasket}
          tone="orange"
          hint={`${kpi.ortDona.toFixed(1)} dona`}
        />
        <StatCard
          label="Xizmat vaqti"
          value={vaqt(kpi.medVaqt)}
          icon={Timer}
          tone="orange"
          hint={
            kpi.vaqtQamrovi > 0
              ? `median · o'rtacha ${vaqt(kpi.ortVaqt)}`
              : "hali o'lchanmagan"
          }
        />
        <StatCard
          label="Naqd"
          value={formatUZS(kpi.naqd, { compact: true })}
          icon={Banknote}
          tone="green"
          hint={
            kpi.tushum > 0
              ? `${((kpi.naqd / kpi.tushum) * 100).toFixed(1)}%`
              : undefined
          }
        />
      </div>

      <ChekAnalitika
        soatlar={soatlar}
        kassirlar={kassirlar}
        kassalar={kassalar}
        stornoCheklar={kpi.stornoCheklar}
        tekinCheklar={kpi.tekinCheklar}
        jamiCheklar={kpi.cheklar}
        vaqtQamrovi={kpi.vaqtQamrovi}
      />

      <CheklarClient
        rows={rows.map((r) => ({
          id: r.id,
          shop: r.shop,
          pos: r.pos,
          number: r.number,
          session: r.session,
          openAt: r.openAt.toISOString(),
          closeAt: r.closeAt?.toISOString() ?? null,
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
        kassirlar={kassirOpts}
        kassalar={kassaOpts}
        filters={{
          from: f.from,
          to: f.to,
          branch: f.branchId,
          kassa: f.kassa,
          kassir: f.cashierId,
          kind: f.kind,
          soatDan: f.soatDan,
          soatGacha: f.soatGacha,
          q: f.q,
          storno: f.storno,
          skuYoq: f.skuYoq,
        }}
        jami={idlar.jami}
        korsatilgan={rows.length}
        bogliqsiz={bogliqsiz}
        taqsimot={taqsimot}
        kinds={kindDefs.map((k) => ({
          code: k.code,
          name: k.name,
          pill: toneOf(k.tone).pill,
        }))}
      />
    </div>
  );
}
