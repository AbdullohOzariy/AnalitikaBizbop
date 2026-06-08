"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import type { ProfitTree } from "@/lib/spisaniya/profit";

function money(n: number) {
  return formatUZS(n, { compact: true });
}
function netClass(n: number) {
  return n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
}

// Sotuv | Tannarx | Yalpi | Chiqim | Sof foyda
function Cells({ sales, cost, gross, writeoff, net }: { sales: number; cost: number; gross: number; writeoff: number; net: number }) {
  return (
    <>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(sales)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{money(cost)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(gross)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-red-600/80 dark:text-red-400/80">{writeoff > 0 ? `−${money(writeoff)}` : "—"}</td>
      <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", netClass(net))}>{money(net)}</td>
    </>
  );
}

export function ProfitTree({ tree }: { tree: ProfitTree }) {
  const [openG, setOpenG] = useState<Set<number>>(() => new Set(tree.groups.map((g) => g.id)));
  const [openC, setOpenC] = useState<Set<number>>(new Set());
  const tg = (id: number) => setOpenG((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const tc = (id: number) => setOpenC((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 text-left font-semibold">Bo&apos;lim / Kategoriya / Subkat</th>
            <th className="px-2 py-2.5 text-right font-semibold">Sotuv</th>
            <th className="px-2 py-2.5 text-right font-semibold">Tannarx</th>
            <th className="px-2 py-2.5 text-right font-semibold">Yalpi</th>
            <th className="px-2 py-2.5 text-right font-semibold">Chiqim</th>
            <th className="px-3 py-2.5 text-right font-semibold">Sof foyda</th>
          </tr>
        </thead>
        <tbody>
          {/* Umumiy */}
          <tr className="border-b-2 border-border bg-muted/60 font-bold">
            <td className="px-3 py-2">JAMI</td>
            <Cells sales={tree.total.sales} cost={tree.total.cost} gross={tree.total.gross} writeoff={tree.total.writeoff} net={tree.total.net} />
          </tr>

          {tree.groups.map((g) => {
            const gOpen = openG.has(g.id);
            return (
              <FragmentGroup key={g.id}>
                <tr className="cursor-pointer border-b border-border bg-muted/30 hover:bg-muted/50" onClick={() => tg(g.id)}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform", gOpen && "rotate-90")} />
                      <span className="font-bold tracking-wide">{g.name}</span>
                    </span>
                  </td>
                  <Cells sales={g.sales} cost={g.cost} gross={g.gross} writeoff={g.writeoff} net={g.net} />
                </tr>

                {gOpen && g.cats.map((c) => {
                  const cOpen = openC.has(c.id);
                  const hasSub = c.subcats.length > 0;
                  return (
                    <FragmentGroup key={c.id}>
                      <tr className={cn("border-b border-border/60", hasSub && "cursor-pointer hover:bg-muted/20")} onClick={() => hasSub && tc(c.id)}>
                        <td className="py-1.5 pl-9 pr-3">
                          <span className="flex items-center gap-1.5">
                            {hasSub
                              ? <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform", cOpen && "rotate-90")} />
                              : <span className="w-3.5" />}
                            <span className="font-semibold text-foreground/80">{c.name}</span>
                          </span>
                        </td>
                        <Cells sales={c.sales} cost={c.cost} gross={c.gross} writeoff={c.writeoff} net={c.net} />
                      </tr>
                      {cOpen && c.subcats.map((s) => (
                        <tr key={s.id} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="py-1.5 pl-16 pr-3 text-foreground/90">{s.name}</td>
                          <Cells sales={s.sales} cost={s.cost} gross={s.gross} writeoff={s.writeoff} net={s.net} />
                        </tr>
                      ))}
                    </FragmentGroup>
                  );
                })}
              </FragmentGroup>
            );
          })}
        </tbody>
      </table>
      {tree.unmappedWriteoff > 0 && (
        <div className="border-t border-border bg-amber-500/[0.06] px-3 py-2 text-xs text-muted-foreground">
          ⚠ Bog&apos;lanmagan chiqim: <span className="font-semibold text-foreground">−{money(tree.unmappedWriteoff)}</span> — sof foydaga kiritilmadi.{" "}
          <a href="/chiqim/moslash" className="underline underline-offset-2">Kategoriya moslash</a> bo&apos;limidan moslang.
        </div>
      )}
    </div>
  );
}

// <tbody> ichida bir nechta <tr> qaytarish uchun React.Fragment wrapper
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
