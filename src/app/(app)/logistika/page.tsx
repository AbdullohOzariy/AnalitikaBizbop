/**
 * Logistika bo'limi. Tablar:
 *  - Ta'minotchi: yetkazib berish scorecard (o'z vaqtida, fill-rate, lead, tsikl).
 *  - Ombor: markaziy ombor qoldig'i (kunlik import + qo'lda tuzatish).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canSeeSuppliers, canManageWarehouse } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Gauge, Truck, CheckCircle2, PackageCheck, Clock, Plus, Send, ArrowLeftRight, ArrowRight, CalendarClock, AlertTriangle } from "lucide-react";
import { PageHeader, StatCard, EmptyState, Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatDateUZ } from "@/lib/format";
import { supplierLogistics } from "@/lib/logistics";
import { expectedDeliveries } from "@/lib/delivery";
import { expiryRisk } from "@/lib/expiry";
import { LogistikaFilter } from "./filter";
import { OmborTab } from "./ombor-tab";
import { MuddatClient } from "./muddat-client";

export const dynamic = "force-dynamic";

type Tab = "scorecard" | "kalendar" | "ombor" | "taqsimot" | "kochirish" | "muddat";

const DIST_STATUS: Record<string, { label: string; tone: "muted" | "green" | "red" | "blue" }> = {
  DRAFT: { label: "Qoralama", tone: "muted" },
  CONFIRMED: { label: "Tasdiqlandi", tone: "green" },
  CANCELLED: { label: "Bekor", tone: "red" },
};

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function pctCls(v: number | null): string {
  if (v == null) return "text-muted-foreground/40";
  if (v >= 90) return "text-emerald-600 dark:text-emerald-400 font-semibold";
  if (v >= 70) return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-red-600 dark:text-red-400 font-semibold";
}
const fmt1 = (v: number | null) => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("uz-UZ"));
const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

export default async function LogistikaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canSeeSuppliers(session.user.role)) redirect("/dashboard-v2");

  // Logistika VAQTINCHALIK o'chirilgan (qayta ishlanmoqda) — Filiallar aro avto-zakaz
  // Sotuv bo'limida tashkil etilmoqda. Qayta yoqish uchun: LOGISTIKA_ENABLED = true.
  const LOGISTIKA_ENABLED = false;
  if (!LOGISTIKA_ENABLED) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Gauge} title="Logistika" description="Vaqtinchalik ish faoliyatida emas" />
        <EmptyState
          icon={Gauge}
          title="Vaqtinchalik ish faoliyatida emas"
          description="Logistika bo'limi qayta ishlanmoqda. Filiallar aro avto-zakaz tez orada Sotuv bo'limida ishga tushadi."
        />
      </div>
    );
  }

  const canEdit = canManageWarehouse(session.user.role);

  const canWh = canManageWarehouse(session.user.role);
  const sp = await searchParams;
  const tab: Tab = sp.tab === "kalendar" ? "kalendar"
    : sp.tab === "ombor" ? "ombor"
    : sp.tab === "muddat" ? "muddat"
    : sp.tab === "taqsimot" && canWh ? "taqsimot"
    : sp.tab === "kochirish" && canWh ? "kochirish"
    : "scorecard";
  const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const startStr = isDate(sp.start) ? sp.start : ymd(new Date(today.getTime() - 89 * 86_400_000));
  const endStr = isDate(sp.end) ? sp.end : ymd(today);

  const TABS: { v: Tab; l: string }[] = [
    { v: "scorecard", l: "Ta'minotchi" },
    { v: "kalendar", l: "Kalendar" },
    { v: "muddat", l: "Muddat" },
    { v: "ombor", l: "Ombor" },
    ...(canWh ? [{ v: "taqsimot" as Tab, l: "Taqsimot" }, { v: "kochirish" as Tab, l: "Ko'chirish" }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gauge}
        title="Logistika"
        description="Yetkazib berish sifati va markaziy ombor qoldig'i"
      />

      <div role="tablist" className="flex gap-2">
        {TABS.map((t) => (
          <Link key={t.v} href={`/logistika?tab=${t.v}`} scroll={false} aria-current={tab === t.v ? "page" : undefined}
            className={cn("inline-flex h-9 items-center rounded-xl border px-4 text-sm font-medium transition-colors",
              tab === t.v ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground")}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "ombor" ? <OmborTab canEdit={canEdit} />
        : tab === "taqsimot" ? <TaqsimotList />
        : tab === "kochirish" ? <KochirishList />
        : tab === "kalendar" ? <DeliveryCalendar />
        : tab === "muddat" ? <MuddatTab canEdit={canWh} />
        : <Scorecard startStr={startStr} endStr={endStr} />}
    </div>
  );
}

async function MuddatTab({ canEdit }: { canEdit: boolean }) {
  const [rows, branches] = await Promise.all([
    expiryRisk(),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return <MuddatClient rows={rows} branches={branches} canEdit={canEdit} />;
}

const dmy = (s: string) => s.split("-").reverse().join(".");

async function DeliveryCalendar() {
  const rows = await expectedDeliveries();
  const lateCount = rows.filter((r) => r.daysLate > 0).length;
  const soonCount = rows.filter((r) => r.daysUntil != null && r.daysUntil >= 0 && r.daysUntil <= 1).length;
  const totalQty = rows.reduce((s, r) => s + r.totalQty, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Kutilmoqda" value={rows.length.toLocaleString("uz-UZ")} icon={Truck} hint="yuborilgan, hali kelmagan zakaz" />
        <StatCard label="Kechikkan" value={lateCount.toLocaleString("uz-UZ")} icon={AlertTriangle}
          tone={lateCount > 0 ? "red" : "green"} hint="kutilgan sanadan o'tib ketgan" />
        <StatCard label="Bugun/ertaga" value={soonCount.toLocaleString("uz-UZ")} icon={CalendarClock} hint="yaqin kunda kutilmoqda" />
        <StatCard label="Jami miqdor" value={Math.round(totalQty).toLocaleString("uz-UZ")} icon={PackageCheck} hint="kutilayotgan dona" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Kutilayotgan yetkazish yo'q" description="Yuborilgan (SENT/ACCEPTED), lekin hali yetib kelmagan zakazlar bu yerda ko'rinadi." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-semibold">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Ta&apos;minotchi / agent</th>
                <th className="px-2 py-2.5 text-left font-semibold">Yuborildi</th>
                <th className="px-2 py-2.5 text-center font-semibold" title="Reja lead (kun)">Lead</th>
                <th className="px-2 py-2.5 text-left font-semibold">Kutilgan</th>
                <th className="px-2 py-2.5 text-left font-semibold">Holat</th>
                <th className="px-2 py-2.5 text-right font-semibold">SKU</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = r.expectedDate == null
                  ? { label: "ETA noma'lum", tone: "muted" as const }
                  : r.daysLate > 0
                    ? { label: `${r.daysLate} kun kechikdi`, tone: "red" as const }
                    : r.daysUntil === 0
                      ? { label: "Bugun", tone: "blue" as const }
                      : { label: `${r.daysUntil} kundan keyin`, tone: "green" as const };
                return (
                  <tr key={r.orderId} className={cn("border-b border-border/40 hover:bg-muted/20", r.daysLate > 0 && "bg-red-500/[0.04]")}>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      <Link href={`/sotuv/sotib-olish/${r.orderId}`} className="hover:underline">#{r.orderId}</Link>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {r.supplier}{r.agent && <span className="ml-1 text-xs font-normal text-muted-foreground">· {r.agent}</span>}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{dmy(r.sentDate)}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-xs text-muted-foreground">{r.plannedLead != null ? Math.ceil(r.plannedLead) : "—"}</td>
                    <td className="px-2 py-2 text-xs">{r.expectedDate ? dmy(r.expectedDate) : "—"}</td>
                    <td className="px-2 py-2"><Pill tone={status.tone}>{status.label}</Pill></td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.itemCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Kutilgan sana = yuborilgan sana + zakaz SKU&apos;larining o&apos;rtacha <b>reja lead</b>&apos;i. Reja lead
        bo&apos;lmagan zakazlar &quot;ETA noma&apos;lum&quot; bo&apos;ladi. Faqat <b>yuborilgan</b> (SENT/ACCEPTED), hali
        <b> qabul qilinmagan</b> zakazlar ko&apos;rsatiladi.
      </p>
    </div>
  );
}

async function KochirishList() {
  const transfers = await prisma.branchTransfer.findMany({
    orderBy: { id: "desc" },
    take: 100,
    select: {
      id: true, status: true, targetDays: true, createdAt: true,
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Filiallararo ko&apos;chirish — manbadagi ortiqcha qoldiqni kam/OOS filialga ko&apos;chirish (ombordan o&apos;tmasdan).</p>
        <Link href="/logistika/kochirish/yangi"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Yangi ko&apos;chirish
        </Link>
      </div>
      {transfers.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Ko'chirish yo'q" description="Yangi ko'chirish tuzing — manba va qabul qiluvchi filialni tanlang, tizim tavsiya beradi." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-semibold">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Yo&apos;nalish</th>
                <th className="px-2 py-2.5 text-left font-semibold">Holat</th>
                <th className="px-2 py-2.5 text-right font-semibold">SKU</th>
                <th className="px-2 py-2.5 text-right font-semibold">Qoplash</th>
                <th className="px-3 py-2.5 text-left font-semibold">Sana</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const st = DIST_STATUS[t.status] ?? { label: t.status, tone: "muted" as const };
                return (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      <Link href={`/logistika/kochirish/${t.id}`} className="hover:underline">#{t.id}</Link>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/logistika/kochirish/${t.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                        {t.fromBranch.name} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {t.toBranch.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2"><Pill tone={st.tone}>{st.label}</Pill></td>
                    <td className="px-2 py-2 text-right tabular-nums">{t._count.items}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{t.targetDays} kun</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateUZ(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function TaqsimotList() {
  const dists = await prisma.distribution.findMany({
    orderBy: { id: "desc" },
    take: 100,
    select: {
      id: true, status: true, targetDays: true, createdAt: true,
      branch: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Ombor → filial taqsimot hujjatlari. Tasdiqlanganda ombor qoldig&apos;idan ayiriladi.</p>
        <Link href="/logistika/taqsimot/yangi"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Yangi taqsimot
        </Link>
      </div>
      {dists.length === 0 ? (
        <EmptyState icon={Send} title="Taqsimot yo'q" description="Yangi taqsimot tuzing — filial va qoplash kunlarini tanlang, tizim tavsiya beradi." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-semibold">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Filial</th>
                <th className="px-2 py-2.5 text-left font-semibold">Holat</th>
                <th className="px-2 py-2.5 text-right font-semibold">SKU</th>
                <th className="px-2 py-2.5 text-right font-semibold">Qoplash</th>
                <th className="px-3 py-2.5 text-left font-semibold">Sana</th>
              </tr>
            </thead>
            <tbody>
              {dists.map((d) => {
                const st = DIST_STATUS[d.status] ?? { label: d.status, tone: "muted" as const };
                return (
                  <tr key={d.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      <Link href={`/logistika/taqsimot/${d.id}`} className="hover:underline">#{d.id}</Link>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/logistika/taqsimot/${d.id}`} className="hover:underline">{d.branch.name}</Link>
                    </td>
                    <td className="px-2 py-2"><Pill tone={st.tone}>{st.label}</Pill></td>
                    <td className="px-2 py-2 text-right tabular-nums">{d._count.items}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{d.targetDays} kun</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateUZ(d.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function Scorecard({ startStr, endStr }: { startStr: string; endStr: string }) {
  const rows = await supplierLogistics(startStr, endStr);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  const avgOnTime = avg(rows.filter((r) => r.ozVaqtidaPct != null).map((r) => r.ozVaqtidaPct!));
  const avgFill = avg(rows.filter((r) => r.fillRatePct != null).map((r) => r.fillRatePct!));
  const avgDelivery = avg(rows.filter((r) => r.yetkazishKun != null).map((r) => r.yetkazishKun!));
  const totalOrders = rows.reduce((s, r) => s + r.jami, 0);

  return (
    <div className="space-y-5">
      <LogistikaFilter basePath="/logistika?tab=scorecard" defaultStart={startStr} defaultEnd={endStr} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Zakazlar (davrda)" value={totalOrders.toLocaleString("uz-UZ")} icon={Truck} hint={`${rows.length} ta ta'minotchi`} />
        <StatCard label="O'z vaqtida (o'rtacha)" value={fmtPct(avgOnTime)} icon={CheckCircle2}
          tone={avgOnTime != null && avgOnTime >= 90 ? "green" : avgOnTime != null && avgOnTime < 70 ? "red" : "default"}
          hint="haqiqiy lead ≤ reja lead" />
        <StatCard label="Fill-rate (o'rtacha)" value={fmtPct(avgFill)} icon={PackageCheck}
          tone={avgFill != null && avgFill >= 90 ? "green" : avgFill != null && avgFill < 70 ? "red" : "default"}
          hint="fakt ÷ buyurtma miqdori" />
        <StatCard label="Yetkazish (o'rtacha)" value={avgDelivery != null ? `${fmt1(avgDelivery)} kun` : "—"} icon={Clock}
          hint="yuborildi → yetib keldi" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Ma'lumot yo'q" description="Tanlangan davrda zakaz topilmadi. Davrni kengaytiring yoki zakaz yarating." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-semibold">Ta&apos;minotchi</th>
                <th className="px-2 py-2.5 text-right font-semibold">Zakaz</th>
                <th className="px-2 py-2.5 text-right font-semibold">Qabul</th>
                <th className="px-2 py-2.5 text-right font-semibold">Qaytdi</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Haqiqiy lead ≤ reja lead">O&apos;z vaqtida</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Fakt ÷ buyurtma">Fill-rate</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Yuborildi → yetib keldi (kun)">Yetkazish</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="SKU reja lead o'rtachasi">Reja lead</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Yaratildi → yetib keldi">Tsikl</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplierId} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.jami}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.qabul}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", r.qaytdi > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground/40")}>{r.qaytdi || "—"}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", pctCls(r.ozVaqtidaPct))}>{fmtPct(r.ozVaqtidaPct)}</td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", pctCls(r.fillRatePct))}>{fmtPct(r.fillRatePct)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.yetkazishKun != null ? `${fmt1(r.yetkazishKun)} kun` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.rejaLead != null ? `${fmt1(r.rejaLead)} kun` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.tsiklKun != null ? `${fmt1(r.tsiklKun)} kun` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        O&apos;z vaqtida va Yetkazish faqat <b>yuborilgan → yetib kelgan</b> zakazlardan; Fill-rate faqat
        <b> fakt kiritilgan</b> zakazlardan. Davr — zakaz yaratilgan sana bo&apos;yicha.
      </p>
    </div>
  );
}
