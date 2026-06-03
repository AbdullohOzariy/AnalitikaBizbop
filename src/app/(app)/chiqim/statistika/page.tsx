import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDefaultRange } from "@/lib/analytics";
import {
  botConfigured,
  chiqimSummary,
  chiqimByBranch,
  vozvratStatusCounts,
  TUR_LABEL,
  VOZVRAT_STATUS_LABEL,
} from "@/lib/spisaniya/db";
import { formatUZS } from "@/lib/format";
import {
  PackageMinus,
  RotateCcw,
  Coffee,
  Utensils,
  ShoppingCart,
  Building2,
  WifiOff,
  ChartPie,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
  Pill,
} from "@/components/common/page";
import { ChiqimFilter } from "../chiqim-filter";
import type { LucideIcon } from "lucide-react";

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type TurMeta = { icon: LucideIcon; tone: "red" | "orange" | "blue" | "green" | "violet" | "default" };
const TUR_META: Record<string, TurMeta> = {
  spisaniya:   { icon: PackageMinus, tone: "red" },
  vozvrat:     { icon: RotateCcw,    tone: "orange" },
  kafe:        { icon: Coffee,       tone: "blue" },
  ovqatlanish: { icon: Utensils,     tone: "green" },
  ichki_sotuv: { icon: ShoppingCart, tone: "violet" },
};

type VozvratStatusMeta = {
  icon: LucideIcon;
  tone: "amber" | "blue" | "green" | "red";
  pillTone: "amber" | "blue" | "green" | "red";
};
const VOZVRAT_META: Record<string, VozvratStatusMeta> = {
  kutilmoqda: { icon: Clock,         tone: "amber", pillTone: "amber" },
  jarayonda:  { icon: Loader2,       tone: "blue",  pillTone: "blue" },
  bajarildi:  { icon: CheckCircle2,  tone: "green", pillTone: "green" },
  rad_etildi: { icon: XCircle,       tone: "red",   pillTone: "red" },
};

export default async function ChiqimStatistikaPage({
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
        <PageHeader
          icon={ChartPie}
          title="Statistika"
          description="Hisobdan chiqarish bo'yicha umumiy statistika"
        />
        <EmptyState
          icon={WifiOff}
          title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate   = parseDate(sp.end)   ?? def.end;
  const range = { start: startDate, end: endDate };

  const [summary, byBranch, vozvratCounts] = await Promise.all([
    chiqimSummary(range),
    chiqimByBranch(range),
    vozvratStatusCounts(range),
  ]);

  const totalSumma = summary.reduce((acc, r) => acc + r.summa, 0);
  const totalCount = summary.reduce((acc, r) => acc + r.count, 0);
  const branchTotal = byBranch.reduce((acc, r) => acc + r.summa, 0);
  const vozvratTotal = vozvratCounts.reduce((acc, r) => acc + r.count, 0);
  const vozvratMap = new Map(vozvratCounts.map((r) => [r.status, r.count]));

  const allTurs = Object.keys(TUR_LABEL);
  const summaryMap = new Map(summary.map((r) => [r.tur, r]));

  const allVozvratStatuses = Object.keys(VOZVRAT_STATUS_LABEL);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ChartPie}
        title="Statistika"
        description="Tanlangan davr bo'yicha umumiy statistika"
      >
        <ChiqimFilter
          filials={[]}
          defaultStart={sp.start ?? fmtDate(def.start)}
          defaultEnd={sp.end ?? fmtDate(def.end)}
          hideTur
          hideFilial
          basePath="/chiqim/statistika"
        />
      </PageHeader>

      {/* Jami */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Jami chiqim"
          value={formatUZS(totalSumma, { compact: true })}
          hint={`${totalCount.toLocaleString("uz-UZ")} ta yozuv`}
          icon={Layers}
          tone="default"
        />
        <StatCard
          label="Faol filiallar"
          value={byBranch.length.toLocaleString("uz-UZ")}
          hint="chiqim mavjud filiallar soni"
          icon={Building2}
          tone="default"
        />
        <StatCard
          label="Qayta ishlash jami"
          value={vozvratTotal.toLocaleString("uz-UZ")}
          hint="tanlangan davrdagi qayta ishlash so'rovlar"
          icon={RotateCcw}
          tone="orange"
        />
      </div>

      {/* Tur bo'yicha */}
      {summary.length > 0 ? (
        <SectionCard
          title="Tur bo'yicha taqsimot"
          description="Har bir chiqim turi bo'yicha summa va soni"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {allTurs.map((turKey) => {
              const meta  = TUR_META[turKey] ?? { icon: PackageMinus, tone: "default" as const };
              const entry = summaryMap.get(turKey);
              const pct = totalSumma > 0 ? ((entry?.summa ?? 0) / totalSumma) * 100 : 0;
              return (
                <div key={turKey} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {TUR_LABEL[turKey] ?? turKey}
                    </span>
                    <meta.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-xl font-bold tabular-nums tracking-tight">
                    {formatUZS(entry?.summa ?? 0, { compact: true })}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {(entry?.count ?? 0).toLocaleString("uz-UZ")} ta yozuv
                  </div>
                  {/* progress */}
                  <div className="mt-3 relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary/50"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-[10px] text-muted-foreground">
                    {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          icon={ChartPie}
          title="Tanlangan davrda ma'lumot yo'q"
          description="Boshqa davr tanlang."
        />
      )}

      {/* Filial bo'yicha */}
      {byBranch.length > 0 && (
        <SectionCard
          title="Filial bo'yicha breakdown"
          description="Summa va ulushi bo'yicha"
          actions={
            <span className="text-xs text-muted-foreground">{byBranch.length} ta filial</span>
          }
        >
          <div className="space-y-2.5">
            {byBranch.map((row) => {
              const pct = branchTotal > 0 ? (row.summa / branchTotal) * 100 : 0;
              return (
                <div key={row.filial} className="flex items-center gap-3">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="w-44 shrink-0 truncate text-xs font-medium" title={row.filial}>
                    {row.filial}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary/60"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums text-xs">
                    {formatUZS(row.summa, { compact: true })}
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
                    {row.count.toLocaleString("uz-UZ")} ta
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Qayta ishlash status */}
      {vozvratTotal > 0 && (
        <SectionCard
          title="Qayta ishlash holati"
          description="Status bo'yicha taqsimot"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {allVozvratStatuses.map((st) => {
              const meta = VOZVRAT_META[st];
              const count = vozvratMap.get(st) ?? 0;
              const pct = vozvratTotal > 0 ? (count / vozvratTotal) * 100 : 0;
              return (
                <div key={st} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={meta.pillTone}>
                      {VOZVRAT_STATUS_LABEL[st] ?? st}
                    </Pill>
                  </div>
                  <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
                    {count.toLocaleString("uz-UZ")}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {pct.toFixed(1)}% jami qayta ishlashdan
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
