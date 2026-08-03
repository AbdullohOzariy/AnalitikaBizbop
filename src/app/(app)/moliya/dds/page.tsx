import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { decimalToNumber, formatUZS } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, TrendingUp, ShieldOff } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { DdsClient } from "./dds-client";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "2026-08" — oy kaliti (Toshkent kuni bo'yicha, businessDate allaqachon shunday). */
const oyKalit = (d: Date) => isoDay(d).slice(0, 7);

export default async function MoliyaDdsPage({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const sp = await searchParams;
  const today = nowTashkent();
  // Standart — joriy yilning boshidan bugungacha
  const yilBoshi = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const from = parseDateParam(one(sp.from), yilBoshi)!;
  const to = parseDateParam(one(sp.to), new Date(isoDay(today) + "T00:00:00.000Z"))!;
  const neytralKorsat = one(sp.neytral) === "1";

  const [articles, txns] = await Promise.all([
    prisma.cashFlowArticle.findMany({
      orderBy: [{ group: { section: "asc" } }, { group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        isNeutral: true,
        group: { select: { id: true, name: true, section: true, sortOrder: true } },
      },
    }),
    // Oy × modda × yo'nalish kesimida yig'indi. businessDate @db.Date bo'lgani uchun
    // guruhlash JS tomonda: oy kaliti sana satridan olinadi (TZ siljishi yo'q).
    prisma.cashTxn.groupBy({
      by: ["businessDate", "articleId", "direction"],
      where: { businessDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const meta = new Map(articles.map((a) => [a.id, a]));

  // oy → articleId → { in, out }
  const oylar = new Set<string>();
  const cells = new Map<string, { in: number; out: number }>();
  const key = (oy: string, articleId: number) => `${oy}|${articleId}`;

  for (const t of txns) {
    const a = meta.get(t.articleId);
    if (!a) continue;
    if (a.isNeutral && !neytralKorsat) continue;
    const oy = oyKalit(t.businessDate);
    oylar.add(oy);
    const k = key(oy, t.articleId);
    const cur = cells.get(k) ?? { in: 0, out: 0 };
    const amt = decimalToNumber(t._sum.amount);
    if (t.direction === "IN") cur.in += amt;
    else cur.out += amt;
    cells.set(k, cur);
  }

  const oyRoyxat = [...oylar].sort();

  // Faqat harakati bo'lgan moddalar ko'rsatiladi — 68 moddaning ko'pi bo'sh bo'ladi.
  const faolArticles = articles.filter((a) =>
    oyRoyxat.some((oy) => cells.has(key(oy, a.id)))
  );

  // Bo'lim → guruh → modda daraxti
  const sections = new Map<
    string,
    Map<number, { name: string; sortOrder: number; articles: typeof faolArticles }>
  >();
  for (const a of faolArticles) {
    const sec = a.group.section;
    if (!sections.has(sec)) sections.set(sec, new Map());
    const gm = sections.get(sec)!;
    if (!gm.has(a.group.id))
      gm.set(a.group.id, { name: a.group.name, sortOrder: a.group.sortOrder, articles: [] });
    gm.get(a.group.id)!.articles.push(a);
  }

  const tree = ["OPERATING", "INVESTING", "FINANCING", "TECHNICAL"]
    .filter((s) => sections.has(s))
    .map((s) => ({
      section: s,
      groups: [...sections.get(s)!.entries()]
        .sort(([, x], [, y]) => x.sortOrder - y.sortOrder)
        .map(([id, g]) => ({
          id,
          name: g.name,
          articles: g.articles.map((a) => ({
            id: a.id,
            name: a.name,
            isNeutral: a.isNeutral,
            byMonth: oyRoyxat.map((oy) => {
              const c = cells.get(key(oy, a.id));
              return { oy, in: c?.in ?? 0, out: c?.out ?? 0 };
            }),
          })),
        })),
    }));

  // KPI — neytral HAR DOIM chiqarilgan (ko'rsatish tugmasi faqat jadvalga ta'sir qiladi)
  let opIn = 0;
  let opOut = 0;
  let invOut = 0;
  let finNet = 0;
  let neutralOut = 0;
  for (const t of txns) {
    const a = meta.get(t.articleId);
    if (!a) continue;
    const amt = decimalToNumber(t._sum.amount);
    if (a.isNeutral) {
      if (t.direction === "OUT") neutralOut += amt;
      continue;
    }
    const sec = a.group.section;
    if (sec === "OPERATING") {
      if (t.direction === "IN") opIn += amt;
      else opOut += amt;
    } else if (sec === "INVESTING" && t.direction === "OUT") invOut += amt;
    else if (sec === "FINANCING") finNet += t.direction === "IN" ? amt : -amt;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={TrendingUp}
        title="DDS — pul oqimi hisoboti"
        description="Bo'lim → guruh → modda, oylar yonma-yon. Neytral moddalar (inkassa, ko'chirish) sukut bo'yicha CHIQARILGAN."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Operatsion kirim"
          value={formatUZS(opIn, { compact: true })}
          icon={ArrowDownLeft}
          tone="green"
        />
        <StatCard
          label="Operatsion chiqim"
          value={formatUZS(opOut, { compact: true })}
          icon={ArrowUpRight}
          tone="red"
          hint={`Sof oqim: ${formatUZS(opIn - opOut, { compact: true })}`}
        />
        <StatCard
          label="Investitsion"
          value={formatUZS(invOut, { compact: true })}
          icon={TrendingUp}
          tone="blue"
          hint={`Moliyaviy sof: ${formatUZS(finNet, { compact: true })}`}
        />
        <StatCard
          label="Neytral (chiqarilgan)"
          value={formatUZS(neutralOut, { compact: true })}
          icon={ShieldOff}
          tone="violet"
          hint="Ichki ko'chirish — hisobotga kirmaydi"
        />
      </div>

      <DdsClient
        tree={tree}
        months={oyRoyxat}
        filters={{ from: isoDay(from), to: isoDay(to), neytral: neytralKorsat }}
      />
    </div>
  );
}
