/**
 * Logistika — ta'minotchi yetkazib berish ko'rsatkichlari (scorecard).
 * Mavjud zakaz ma'lumotidan: o'z vaqtida %, fill-rate, haqiqiy lead, tsikl, qaytarish.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeSuppliers } from "@/lib/roles";
import { Gauge, Truck, CheckCircle2, PackageCheck, Clock } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { supplierLogistics } from "@/lib/logistics";
import { LogistikaFilter } from "./filter";

export const dynamic = "force-dynamic";

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

// Foiz rangi: yashil yaxshi, sariq o'rtacha, qizil yomon (yo'q — neytral)
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

  const sp = await searchParams;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const defEnd = ymd(today);
  const defStart = ymd(new Date(today.getTime() - 89 * 86_400_000)); // oxirgi 90 kun
  const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startStr = isDate(sp.start) ? sp.start : defStart;
  const endStr = isDate(sp.end) ? sp.end : defEnd;

  const rows = await supplierLogistics(startStr, endStr);

  // Umumiy KPI — qabul qilingan zakazlar bo'yicha o'rtacha (oddiy)
  const withOnTime = rows.filter((r) => r.ozVaqtidaPct != null);
  const withFill = rows.filter((r) => r.fillRatePct != null);
  const withDelivery = rows.filter((r) => r.yetkazishKun != null);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  const avgOnTime = avg(withOnTime.map((r) => r.ozVaqtidaPct!));
  const avgFill = avg(withFill.map((r) => r.fillRatePct!));
  const avgDelivery = avg(withDelivery.map((r) => r.yetkazishKun!));
  const totalOrders = rows.reduce((s, r) => s + r.jami, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gauge}
        title="Logistika — ta'minotchi ko'rsatkichlari"
        description="Yetkazib berish sifati: o'z vaqtida, to'liqlik (fill-rate), haqiqiy lead — zakaz tarixidan"
      >
        <LogistikaFilter basePath="/logistika" defaultStart={startStr} defaultEnd={endStr} />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Zakazlar (davrda)" value={totalOrders.toLocaleString("uz-UZ")} icon={Truck}
          hint={`${rows.length} ta ta'minotchi`} />
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
                <th className="px-2 py-2.5 text-right font-semibold" title="Davrda yaratilgan zakazlar">Zakaz</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Yetib kelgan (RECEIVED)">Qabul</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Qaytarilgan (RETURNED)">Qaytdi</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="O'z vaqtida: haqiqiy lead ≤ reja lead">O&apos;z vaqtida</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Fakt ÷ buyurtma miqdori (fakt kiritilgan zakazlar)">Fill-rate</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Yuborildi → yetib keldi (haqiqiy lead, kun)">Yetkazish</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="SKU reja lead o'rtachasi (kun)">Reja lead</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="Yaratildi → yetib keldi (kun)">Tsikl</th>
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
        O&apos;z vaqtida va Yetkazish faqat <b>yuborilgan → yetib kelgan</b> (sentAt/receivedAt bor) zakazlardan; Fill-rate faqat
        <b> fakt miqdori kiritilgan</b> zakazlardan hisoblanadi. Davr — zakaz yaratilgan sana bo&apos;yicha.
      </p>
    </div>
  );
}
