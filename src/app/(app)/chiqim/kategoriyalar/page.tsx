import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  botConfigured,
  chiqimDefaultRange,
  chiqimSummary,
  chiqimByKategoriya,
  chiqimFilials,
} from "@/lib/spisaniya/db";
import { formatUZS } from "@/lib/format";
import { Tag, WifiOff, Layers, Hash } from "lucide-react";
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
} from "@/components/common/page";
import { ChiqimFilter } from "../chiqim-filter";
import { ChiqimExportButton } from "../chiqim-export-button";

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ChiqimKategoriyalarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "CEO")
    redirect("/dashboard-v2");

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={Tag}
          title="Kategoriyalar"
          description="Kategoriya bo'yicha chiqim tahlili"
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
  const def = chiqimDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate   = parseDate(sp.end)   ?? def.end;
  const filialFilter = sp.filial || undefined;
  const range = { start: startDate, end: endDate };

  const [byKategoriya, summary, filials] = await Promise.all([
    chiqimByKategoriya(range),
    chiqimSummary(range),
    chiqimFilials(),
  ]);

  const totalSumma = summary.reduce((acc, r) => acc + r.summa, 0);
  const katTotal   = byKategoriya.reduce((acc, r) => acc + r.summa, 0);

  // Kamayish tartibida saralash
  const sorted = [...byKategoriya].sort((a, b) => b.summa - a.summa);
  const topKat = sorted[0];

  return (
    <div className="space-y-5">
      {/* Sarlavha + filtr */}
      <PageHeader
        icon={Tag}
        title="Kategoriyalar"
        description="Tanlangan davr bo'yicha kategoriya tahlili"
      >
        <ChiqimFilter
          filials={filials}
          defaultStart={sp.start ?? fmtDate(def.start)}
          defaultEnd={sp.end ?? fmtDate(def.end)}
          defaultFilial={sp.filial}
          hideTur
          basePath="/chiqim/kategoriyalar"
        />
        <ChiqimExportButton params={{ ...sp, filial: filialFilter }} />
      </PageHeader>

      {/* StatCard qatori */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Jami chiqim summasi"
          value={formatUZS(totalSumma, { compact: true })}
          hint="tanlangan davrda"
          icon={Layers}
          tone="default"
        />
        <StatCard
          label="Kategoriyalar soni"
          value={byKategoriya.length.toLocaleString("uz-UZ")}
          hint="chiqim mavjud kategoriyalar"
          icon={Hash}
          tone="blue"
        />
        <StatCard
          label="Eng katta kategoriya"
          value={topKat ? formatUZS(topKat.summa, { compact: true }) : "—"}
          hint={topKat?.kategoriya ?? "Ma'lumot yo'q"}
          icon={Tag}
          tone="violet"
        />
      </div>

      {/* Kategoriya bo'yicha taqsimot */}
      {sorted.length > 0 ? (
        <SectionCard
          title="Kategoriya bo'yicha taqsimot"
          description="Summa bo'yicha kamayish tartibida"
          actions={
            <span className="text-xs text-muted-foreground">
              {sorted.length} ta kategoriya
            </span>
          }
        >
          <div className="space-y-2.5">
            {sorted.map((row) => {
              const pct = katTotal > 0 ? (row.summa / katTotal) * 100 : 0;
              return (
                <div key={row.kategoriya} className="flex items-center gap-3">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className="w-44 shrink-0 truncate text-xs font-medium"
                    title={row.kategoriya}
                  >
                    {row.kategoriya}
                  </span>
                  {/* Progress bar */}
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
      ) : (
        <EmptyState
          icon={Tag}
          title="Tanlangan davrda ma'lumot yo'q"
          description="Boshqa davr yoki filtr tanlang."
        />
      )}
    </div>
  );
}
