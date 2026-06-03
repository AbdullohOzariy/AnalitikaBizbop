import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDefaultRange } from "@/lib/analytics";
import {
  botConfigured,
  chiqimFilials,
  vozvratList,
  vozvratStatusCounts,
  VOZVRAT_STATUS_LABEL,
} from "@/lib/spisaniya/db";
import { formatUZS } from "@/lib/format";
import {
  Recycle,
  WifiOff,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
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
import { BazaPagination } from "../../baza/baza-pagination";
import { VozvratFilter } from "./vozvrat-filter";
import { VozvratStatusControl } from "./vozvrat-status-control";
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

function fmtDateTime(s: string): string {
  return s.slice(0, 16).replace("T", " ");
}

type StatusMeta = {
  icon: LucideIcon;
  tone: "amber" | "blue" | "green" | "red";
  statTone: "default" | "orange" | "blue" | "green" | "red";
};

const STATUS_META: Record<string, StatusMeta> = {
  kutilmoqda: { icon: Clock,         tone: "amber", statTone: "default" },
  jarayonda:  { icon: Loader2,       tone: "blue",  statTone: "blue" },
  bajarildi:  { icon: CheckCircle2,  tone: "green", statTone: "green" },
  rad_etildi: { icon: XCircle,       tone: "red",   statTone: "red" },
};

const PILL_TONE: Record<string, "amber" | "blue" | "green" | "red" | "muted"> = {
  kutilmoqda: "amber",
  jarayonda:  "blue",
  bajarildi:  "green",
  rad_etildi: "red",
};

export default async function VozvratPage({
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
          icon={Recycle}
          title="Qayta ishlash"
          description="Qayta ishlangan mahsulotlar holati"
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
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate   = parseDate(sp.end)   ?? def.end;
  const statusFilter = sp.status || undefined;
  const filialFilter = sp.filial || undefined;

  const range = { start: startDate, end: endDate };

  const [statusCounts, records, filials] = await Promise.all([
    vozvratStatusCounts(range),
    vozvratList(range, {
      status:   statusFilter,
      filial:   filialFilter,
      page,
      pageSize: PAGE_SIZE,
    }),
    chiqimFilials(),
  ]);

  const { rows, total } = records;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statusMap = new Map(statusCounts.map((r) => [r.status, r.count]));
  const allStatuses = Object.keys(VOZVRAT_STATUS_LABEL);

  return (
    <div className="space-y-5">
      {/* Sarlavha + filtr */}
      <PageHeader
        icon={Recycle}
        title="Qayta ishlash"
        description="Qayta ishlangan mahsulotlar nazorati"
      >
        <VozvratFilter
          filials={filials}
          defaultStart={sp.start ?? fmtDate(def.start)}
          defaultEnd={sp.end ?? fmtDate(def.end)}
          defaultStatus={sp.status}
          defaultFilial={sp.filial}
        />
      </PageHeader>

      {/* Status StatCardlar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {allStatuses.map((st) => {
          const meta  = STATUS_META[st] ?? { icon: Clock, statTone: "default" as const };
          const count = statusMap.get(st) ?? 0;
          return (
            <StatCard
              key={st}
              label={VOZVRAT_STATUS_LABEL[st] ?? st}
              value={count.toLocaleString("uz-UZ")}
              hint="ta yozuv"
              icon={meta.icon}
              tone={meta.statTone}
            />
          );
        })}
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Recycle}
              title="Tanlangan davrda qayta ishlash yozuvlari yo'q"
              description="Boshqa davr yoki filtr tanlang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[130px]">Vaqt</TableHead>
                      <TableHead>Tovar</TableHead>
                      <TableHead className="text-right w-[110px]">Miqdor</TableHead>
                      <TableHead className="text-right w-[120px]">Summa</TableHead>
                      <TableHead className="w-[120px]">Filial</TableHead>
                      <TableHead className="w-[120px]">Firma</TableHead>
                      <TableHead className="w-[110px]">Xodim</TableHead>
                      <TableHead className="w-[110px]">Holat</TableHead>
                      <TableHead>Firma javobi</TableHead>
                      <TableHead className="w-[100px]">Muddat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="text-sm">
                        {/* Vaqt */}
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDateTime(r.vaqt)}
                        </TableCell>

                        {/* Tovar */}
                        <TableCell className="text-xs max-w-[180px] truncate" title={r.tovar}>
                          {r.tovar}
                        </TableCell>

                        {/* Miqdor */}
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

                        {/* Firma */}
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={r.firma ?? undefined}>
                          {r.firma || "—"}
                        </TableCell>

                        {/* Xodim */}
                        <TableCell className="text-xs max-w-[110px] truncate" title={r.xodim_ism}>
                          {r.xodim_ism || "—"}
                        </TableCell>

                        {/* Holat — bosib o'zgartirish mumkin (bot API orqali) */}
                        <TableCell>
                          <VozvratStatusControl
                            id={r.id}
                            currentStatus={r.vozvrat_status}
                            currentFirmaJavob={r.firma_javob}
                          />
                        </TableCell>

                        {/* Firma javobi */}
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[160px] truncate"
                          title={r.firma_javob ?? undefined}
                        >
                          {r.firma_javob || "—"}
                        </TableCell>

                        {/* Muddat */}
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {r.muddat ? r.muddat.slice(0, 10) : "—"}
                        </TableCell>
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
                  basePath="/chiqim/vozvrat"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
