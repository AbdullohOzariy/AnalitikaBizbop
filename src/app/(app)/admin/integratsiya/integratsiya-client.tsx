"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Filter, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill, EmptyState } from "@/components/common/page";
import { formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Row = {
  id: number;
  kind: string;
  externalId: string | null;
  externalNo: string | null;
  occurredAt: string | null;
  status: string;
  error: string | null;
  attempts: number;
  batchId: string | null;
  receivedAt: string;
  payload: unknown;
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-400/15 text-amber-700 dark:text-amber-400",
  PROCESSED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-destructive/10 text-destructive",
  SKIPPED: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "kutmoqda",
  PROCESSED: "ishlandi",
  FAILED: "xato",
  SKIPPED: "o'tkazildi",
};

export function IntegratsiyaClient({
  rows,
  kinds,
  filters,
}: {
  rows: Row[];
  kinds: { kind: string; count: number }[];
  filters: { kind: string | null; status: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [openId, setOpenId] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const applyFilter = (patch: { kind?: string; status?: string }) => {
    const p = new URLSearchParams();
    const k = patch.kind ?? filters.kind ?? "";
    const s = patch.status ?? filters.status ?? "";
    if (k) p.set("kind", k);
    if (s) p.set("status", s);
    router.push(p.toString() ? `${pathname}?${p}` : pathname);
  };

  const copy = (row: Row) => {
    navigator.clipboard.writeText(JSON.stringify(row.payload, null, 2));
    setCopied(row.id);
    toast.success("Payload nusxalandi.");
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filtr
          </div>
          <select
            value={filters.kind ?? ""}
            onChange={(e) => applyFilter({ kind: e.target.value })}
            className="h-8 min-w-[200px] rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Barcha turlar</option>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.kind} ({k.count})
              </option>
            ))}
          </select>
          <select
            value={filters.status ?? ""}
            onChange={(e) => applyFilter({ status: e.target.value })}
            className="h-8 min-w-[150px] rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Barcha holatlar</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {(filters.kind || filters.status) && (
            <Button variant="ghost" size="sm" onClick={() => router.push(pathname)} className="text-xs">
              Tozalash
            </Button>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Hodisa yo'q"
          description="1C hali hech narsa yubormagan yoki filtrlarga mos yozuv topilmadi."
        />
      ) : (
        <Card>
          <CardContent className="space-y-1 py-3">
            {rows.map((r) => {
              const open = openId === r.id;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-xl border border-border bg-card/50 transition-colors",
                    open && "border-primary/40 bg-card"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                  >
                    <Pill className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Pill>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.kind}</span>
                    {r.externalNo && (
                      <span className="shrink-0 text-xs text-muted-foreground">№{r.externalNo}</span>
                    )}
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {r.occurredAt ? formatDateTimeUZ(r.occurredAt) : "sanasiz"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>

                  {open && (
                    <div className="space-y-2 border-t border-border px-3 py-3">
                      <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                        <Field label="Qabul qilindi" value={formatDateTimeUZ(r.receivedAt)} />
                        <Field label="Hujjat sanasi" value={r.occurredAt ? formatDateTimeUZ(r.occurredAt) : "—"} />
                        <Field label="Ref_Key" value={r.externalId ?? "—"} mono />
                        <Field label="Partiya (batch)" value={r.batchId ?? "—"} mono />
                        {r.attempts > 0 && <Field label="Urinishlar" value={String(r.attempts)} />}
                      </div>

                      {r.error && (
                        <div className="rounded-lg bg-destructive/5 p-2.5 text-xs text-destructive">
                          {r.error}
                        </div>
                      )}

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Xom payload (1C yuborgan holicha)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copy(r)}
                            className="h-7 gap-1 px-2 text-[11px]"
                          >
                            {copied === r.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            Nusxalash
                          </Button>
                        </div>
                        <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed">
                          {JSON.stringify(r.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 100 && (
              <p className="pt-2 text-center text-[11px] text-muted-foreground">
                Oxirgi 100 ta ko&apos;rsatilmoqda — filtr bilan toraytiring
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className={cn("min-w-0 truncate", mono && "font-mono text-[10px]")}>{value}</span>
    </div>
  );
}
