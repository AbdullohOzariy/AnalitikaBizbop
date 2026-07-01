"use client";

import { Fragment, useState, useTransition } from "react";
import { ChevronRight, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { chiqimKategoriyaTovarlarAction, type TovarRow } from "./actions";

type KatRow = { kategoriya: string; count: number; summa: number };

/** Kategoriya bo'yicha breakdown — har kategoriya bosilsa ichidagi tovarlar ochiladi (drill-down). */
export function KategoriyaBreakdown({ rows, katTotal, params }: {
  rows: KatRow[];
  katTotal: number;
  params: { start: string; end: string; filial?: string };
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, TovarRow[]>>({});
  const [loadingKat, setLoadingKat] = useState<string | null>(null);
  const [, start] = useTransition();

  const toggle = (kat: string) => {
    if (open === kat) { setOpen(null); return; }
    setOpen(kat);
    if (items[kat]) return; // keshlangan — qayta so'ramaymiz
    setLoadingKat(kat);
    start(async () => {
      const res = await chiqimKategoriyaTovarlarAction({ ...params, kategoriya: kat });
      setLoadingKat((k) => (k === kat ? null : k));
      if (res.ok) setItems((p) => ({ ...p, [kat]: res.rows }));
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const pct = katTotal > 0 ? (row.summa / katTotal) * 100 : 0;
        const isOpen = open === row.kategoriya;
        const its = items[row.kategoriya];
        return (
          <Fragment key={row.kategoriya}>
            <button type="button" onClick={() => toggle(row.kategoriya)}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/50"
              aria-expanded={isOpen}>
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              <span className="w-44 shrink-0 truncate text-xs font-medium" title={row.kategoriya}>{row.kategoriya}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary/60" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right tabular-nums text-xs">{formatUZS(row.summa, { compact: true })}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
              <span className="w-14 shrink-0 text-right tabular-nums text-xs text-muted-foreground">{row.count.toLocaleString("uz-UZ")} ta</span>
            </button>

            {isOpen && (
              <div className="ml-[26px] space-y-1 border-l border-border/60 py-1 pl-3">
                {loadingKat === row.kategoriya ? (
                  <p className="py-1 text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Yuklanmoqda…</p>
                ) : !its || its.length === 0 ? (
                  <p className="py-1 text-xs text-muted-foreground">Tovar topilmadi.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-3 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      <span className="min-w-0 flex-1">Tovar ({its.length})</span>
                      <span className="w-24 shrink-0 text-right">Summa</span>
                      <span className="w-16 shrink-0 text-right">Miqdor</span>
                      <span className="w-12 shrink-0 text-right">Soni</span>
                    </div>
                    {its.map((it) => (
                      <div key={it.tovar} className="flex items-center gap-3 rounded px-1 py-0.5 text-xs hover:bg-muted/30">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-muted-foreground" title={it.tovar}>
                          <Package className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                          <span className="truncate">{it.tovar}</span>
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums">{formatUZS(it.summa, { compact: true })}</span>
                        <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{it.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 1 })}</span>
                        <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{it.count.toLocaleString("uz-UZ")}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
