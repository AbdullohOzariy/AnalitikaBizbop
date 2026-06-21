import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeChiqim, isSystemAdmin } from "@/lib/roles";
import {
  botConfigured,
  chiqimDefaultRange,
  chiqimSummary,
  chiqimByBranch,
  chiqimRecords,
  chiqimFilials,
  botKategoriyalar,
  TUR_LABEL,
} from "@/lib/spisaniya/db";
import { formatUZS } from "@/lib/format";
import {
  PackageMinus,
  RotateCcw,
  Coffee,
  Utensils,
  ShoppingCart,
  Layers,
  Building2,
  WifiOff,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  SectionCard,
  EmptyState,
  Pill,
} from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BazaPagination } from "../baza/baza-pagination";
import { ChiqimFilter } from "./chiqim-filter";
import { ChiqimExportButton } from "./chiqim-export-button";
import { ChiqimRowActions } from "./chiqim-row-actions";
import { ImageThumb } from "@/components/common/image-thumb";
import type { LucideIcon } from "lucide-react";

const PAGE_SIZE = 50;

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Tur uchun ikonka va rang
type TurMeta = {
  icon: LucideIcon;
  tone: "red" | "orange" | "blue" | "green" | "violet";
};

const TUR_META: Record<string, TurMeta> = {
  spisaniya:   { icon: PackageMinus, tone: "red" },
  vozvrat:     { icon: RotateCcw,    tone: "orange" },
  kafe:        { icon: Coffee,       tone: "blue" },
  ovqatlanish: { icon: Utensils,     tone: "green" },
  ichki_sotuv: { icon: ShoppingCart, tone: "violet" },
};

const TUR_PILL_TONE: Record<string, "red" | "orange" | "blue" | "green" | "violet" | "muted"> = {
  spisaniya:   "red",
  vozvrat:     "orange",
  kafe:        "blue",
  ovqatlanish: "green",
  ichki_sotuv: "violet",
};

export default async function ChiqimPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Auth
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (!canSeeChiqim(role)) redirect("/dashboard-v2");

  // Bot ulanmaganmi?
  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={PackageMinus}
          title="Hisobdan chiqarish"
          description="BotBizBopSPS dan chiqim yozuvlari (read-only)"
        />
        <EmptyState
          icon={WifiOff}
          title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan. Serverga BOT_DATABASE_URL qo'shib qayta ishga tushiring."
        />
      </div>
    );
  }

  // SearchParams
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const def = chiqimDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate   = parseDate(sp.end)   ?? def.end;
  const turFilter    = sp.tur    || undefined;
  const filialFilter = sp.filial || undefined;

  const range = { start: startDate, end: endDate };

  // Parallel data fetch
  const [summary, byBranch, records, filials, kategoriyalarRaw] = await Promise.all([
    chiqimSummary(range, filialFilter, turFilter),
    chiqimByBranch(range, filialFilter, turFilter),
    chiqimRecords(range, {
      tur:      turFilter,
      filial:   filialFilter,
      page,
      pageSize: PAGE_SIZE,
    }),
    chiqimFilials(),
    botKategoriyalar(),
  ]);

  const katNomlari = kategoriyalarRaw.map((k) => k.nomi);

  const { rows, total } = records;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Umumiy jami (barcha turlar)
  const totalSumma = summary.reduce((acc, r) => acc + r.summa, 0);
  const totalCount = summary.reduce((acc, r) => acc + r.count, 0);

  // StatCard uchun turlar to'liq to'plam (0 qiymat bilan ham)
  const summaryMap = new Map(summary.map((r) => [r.tur, r]));
  const allTurs = Object.keys(TUR_LABEL);

  // Filial breakdown uchun jami (foiz hisoblash)
  const branchTotal = byBranch.reduce((acc, r) => acc + r.summa, 0);

  return (
    <div className="space-y-5">
      {/* Sarlavha + filtr */}
      <PageHeader
        icon={PackageMinus}
        title="Hisobdan chiqarish"
        description="BotBizBopSPS dan chiqim yozuvlari"
      >
        <ChiqimFilter
          filials={filials}
          defaultStart={sp.start ?? fmtDate(def.start)}
          defaultEnd={sp.end ?? fmtDate(def.end)}
          defaultTur={sp.tur}
          defaultFilial={sp.filial}
        />
        <ChiqimExportButton params={sp} />
      </PageHeader>

      {/* StatCard qatori — turlar bo'yicha + jami */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {allTurs.map((turKey) => {
          const meta  = TUR_META[turKey] ?? { icon: PackageMinus, tone: "default" as const };
          const entry = summaryMap.get(turKey);
          return (
            <StatCard
              key={turKey}
              label={TUR_LABEL[turKey] ?? turKey}
              value={formatUZS(entry?.summa ?? 0, { compact: true })}
              hint={`${(entry?.count ?? 0).toLocaleString("uz-UZ")} ta yozuv`}
              icon={meta.icon}
              tone={meta.tone}
            />
          );
        })}
        {/* Jami */}
        <StatCard
          label="Jami chiqim"
          value={formatUZS(totalSumma, { compact: true })}
          hint={`${totalCount.toLocaleString("uz-UZ")} ta yozuv`}
          icon={Layers}
          tone="default"
        />
      </div>

      {/* Filial bo'yicha breakdown */}
      {byBranch.length > 0 && (
        <SectionCard
          title="Filial bo'yicha"
          description="Tanlangan davrda tur bo'yicha filial ulushi"
          actions={
            <span className="text-xs text-muted-foreground">
              {byBranch.length} ta filial
            </span>
          }
        >
          <div className="space-y-2">
            {byBranch.map((row) => {
              const pct = branchTotal > 0 ? (row.summa / branchTotal) * 100 : 0;
              return (
                <div key={row.filial} className="flex items-center gap-3">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="w-40 shrink-0 truncate text-xs font-medium">
                    {row.filial}
                  </span>
                  {/* Progress bar */}
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary/60"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums text-xs text-muted-foreground">
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

      {/* Yozuvlar jadvali */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={PackageMinus}
              title="Tanlangan davrda ma'lumot yo'q"
              description="Boshqa davr yoki filtr tanlang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[130px]">Vaqt</TableHead>
                      <TableHead className="w-[110px]">Tur</TableHead>
                      <TableHead>Tovar</TableHead>
                      <TableHead className="text-right w-[100px]">Miqdor</TableHead>
                      <TableHead className="text-right w-[120px]">Summa</TableHead>
                      <TableHead className="w-[120px]">Filial</TableHead>
                      <TableHead className="w-[120px]">Kategoriya</TableHead>
                      <TableHead>Sabab</TableHead>
                      <TableHead className="w-[120px]">Xodim</TableHead>
                      {isSystemAdmin(role) && (
                        <TableHead className="w-[80px] text-right">Amallar</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="text-sm">
                        {/* Vaqt */}
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {r.vaqt.slice(0, 16).replace("T", " ")}
                        </TableCell>

                        {/* Tur (Pill) */}
                        <TableCell>
                          <Pill tone={TUR_PILL_TONE[r.tur] ?? "muted"}>
                            {TUR_LABEL[r.tur] ?? r.tur}
                          </Pill>
                        </TableCell>

                        {/* Tovar + rasm (bo'lsa) */}
                        <TableCell className="text-xs max-w-[210px]">
                          <span className="flex items-center gap-2">
                            {r.rasm_file_id && <ImageThumb fileId={r.rasm_file_id} caption={r.tovar} />}
                            <span className="truncate" title={r.tovar}>{r.tovar}</span>
                          </span>
                        </TableCell>

                        {/* Miqdor + birlik */}
                        <TableCell className="text-right tabular-nums text-xs whitespace-nowrap">
                          {r.miqdor != null
                            ? `${r.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })} ${r.birlik ?? ""}`
                            : "—"}
                        </TableCell>

                        {/* Summa */}
                        <TableCell className="text-right tabular-nums text-xs font-medium whitespace-nowrap">
                          {formatUZS(r.summa ?? 0)}
                        </TableCell>

                        {/* Filial */}
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={r.filial}>
                          {r.filial || "—"}
                        </TableCell>

                        {/* Kategoriya */}
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={r.kategoriya ?? undefined}>
                          {r.kategoriya || "—"}
                        </TableCell>

                        {/* Sabab */}
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={r.sabab ?? undefined}>
                          {r.sabab || "—"}
                        </TableCell>

                        {/* Xodim */}
                        <TableCell className="text-xs max-w-[120px] truncate" title={r.xodim_ism}>
                          {r.xodim_ism || "—"}
                        </TableCell>

                        {/* Amallar — faqat ADMIN */}
                        {isSystemAdmin(role) && (
                          <TableCell className="text-right">
                            <ChiqimRowActions
                              record={r}
                              filials={filials}
                              kategoriyalar={katNomlari}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} / jami{" "}
                  {total.toLocaleString("uz-UZ")} qator · {totalPages} sahifa
                </p>
                <BazaPagination
                  page={page}
                  totalPages={totalPages}
                  basePath="/chiqim"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
