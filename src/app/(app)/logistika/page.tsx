/**
 * Logistika bo'limi. Tablar:
 *  - Ta'minotchi: yetkazib berish scorecard (o'z vaqtida, fill-rate, lead, tsikl).
 *  - Ombor: markaziy ombor qoldig'i (kunlik import + qo'lda tuzatish).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canSeeSuppliers, canEditSuppliers } from "@/lib/roles";
import { Gauge, Truck, CheckCircle2, PackageCheck, Clock } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { supplierLogistics } from "@/lib/logistics";
import { LogistikaFilter } from "./filter";
import { OmborTab } from "./ombor-tab";

export const dynamic = "force-dynamic";

type Tab = "scorecard" | "ombor";

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
  const canEdit = canEditSuppliers(session.user.role);

  const sp = await searchParams;
  const tab: Tab = sp.tab === "ombor" ? "ombor" : "scorecard";
  const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const startStr = isDate(sp.start) ? sp.start : ymd(new Date(today.getTime() - 89 * 86_400_000));
  const endStr = isDate(sp.end) ? sp.end : ymd(today);

  const TABS: { v: Tab; l: string }[] = [
    { v: "scorecard", l: "Ta'minotchi" },
    { v: "ombor", l: "Ombor" },
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

      {tab === "ombor" ? <OmborTab canEdit={canEdit} /> : <Scorecard startStr={startStr} endStr={endStr} />}
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
