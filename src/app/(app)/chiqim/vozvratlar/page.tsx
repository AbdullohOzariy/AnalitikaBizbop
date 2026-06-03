import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  botConfigured,
  aktivFilialNomlari,
  vozvratKanban,
  vozvratSummary,
  chiqimDefaultRange,
  VOZVRAT_HOLATLAR,
  VOZVRAT_HOLAT_LABEL,
} from "@/lib/spisaniya/db";
import { formatUZS } from "@/lib/format";
import { Recycle, WifiOff, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { ChiqimFilter } from "../chiqim-filter";
import { VozvratCard } from "./vozvrat-card";

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const COLUMN_ACCENT: Record<string, string> = {
  xabar_berildi: "border-t-blue-500",
  yuborildi: "border-t-amber-500",
  qaytarildi: "border-t-primary",
  qaytarilmadi: "border-t-destructive",
};

export default async function VozvratlarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER") redirect("/dashboard");

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Recycle} title="Vozvratlar" description="Qaytarish jarayoni (kanban)" />
        <EmptyState icon={WifiOff} title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan." />
      </div>
    );
  }

  const sp = await searchParams;
  const def = chiqimDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate = parseDate(sp.end) ?? def.end;
  const range = { start: startDate, end: endDate };
  const filial = sp.filial || undefined;

  const [rows, summary, filials] = await Promise.all([
    vozvratKanban(range, filial),
    vozvratSummary(range, filial),
    aktivFilialNomlari(),
  ]);

  const byStatus = new Map<string, typeof rows>();
  for (const st of VOZVRAT_HOLATLAR) byStatus.set(st, []);
  for (const r of rows) byStatus.get(r.status)?.push(r);

  return (
    <div className="space-y-5">
      <PageHeader icon={Recycle} title="Vozvratlar" description="Qaytarish jarayoni — kanban">
        <ChiqimFilter
          filials={filials}
          defaultStart={sp.start ?? fmtDate(def.start)}
          defaultEnd={sp.end ?? fmtDate(def.end)}
          defaultFilial={sp.filial}
          hideTur
          basePath="/chiqim/vozvratlar"
        />
      </PageHeader>

      {/* Yuqori summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Qaytarilgan"
          value={formatUZS(summary.qaytarildiSumma, { compact: true })}
          hint="qabul qilinib qaytarilgan summa"
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Qaytarilmagan"
          value={formatUZS(summary.qaytarilmadiSumma, { compact: true })}
          hint="qabul qilinib qaytarilmagan summa"
          icon={AlertTriangle}
          tone="red"
        />
        <StatCard
          label="Jami vozvratlar"
          value={summary.jamiSoni.toLocaleString("uz-UZ")}
          hint="tanlangan davrda"
          icon={Layers}
          tone="default"
        />
      </div>

      {/* Kanban */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VOZVRAT_HOLATLAR.map((st) => {
          const items = byStatus.get(st) ?? [];
          return (
            <div key={st} className={`rounded-2xl border border-t-4 ${COLUMN_ACCENT[st]} border-border bg-muted/30`}>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/60">
                <span className="text-sm font-semibold">{VOZVRAT_HOLAT_LABEL[st]}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2.5 p-2.5 min-h-[80px]">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Bo&apos;sh</p>
                ) : (
                  items.map((v) => <VozvratCard key={v.id} v={v} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
