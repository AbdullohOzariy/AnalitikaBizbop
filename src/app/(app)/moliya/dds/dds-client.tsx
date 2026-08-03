"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronRight, Filter, ShieldOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/page";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cell = { oy: string; in: number; out: number };
type Article = { id: number; name: string; isNeutral: boolean; byMonth: Cell[] };
type Group = { id: number; name: string; articles: Article[] };
type Section = { section: string; groups: Group[] };

const SECTION_META: Record<string, { label: string; hint: string; accent: string }> = {
  OPERATING: { label: "Operatsion faoliyat", hint: "kundalik savdo va xarajatlar", accent: "border-l-primary" },
  INVESTING: { label: "Investitsion faoliyat", hint: "qurilish, yer, uzoq muddatli aktivlar", accent: "border-l-blue-500" },
  FINANCING: { label: "Moliyaviy faoliyat", hint: "egasi, qarz, kredit, dividend", accent: "border-l-violet-500" },
  TECHNICAL: { label: "Texnik (neytral)", hint: "ichki ko'chirish — natijaga kirmaydi", accent: "border-l-muted-foreground" },
};

const OY_NOM = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const oyLabel = (oy: string) => {
  const [y, m] = oy.split("-");
  return `${OY_NOM[Number(m) - 1] ?? m} ${y.slice(2)}`;
};

/** Modda qatori uchun sof qiymat: kirim − chiqim. */
const sof = (c: Cell) => c.in - c.out;

export function DdsClient({
  tree,
  months,
  filters,
}: {
  tree: Section[];
  months: string[];
  filters: { from: string; to: string; neytral: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());

  const apply = (patch: Partial<{ from: string; to: string; neytral: boolean }>) => {
    const p = new URLSearchParams();
    p.set("from", patch.from ?? filters.from);
    p.set("to", patch.to ?? filters.to);
    if (patch.neytral ?? filters.neytral) p.set("neytral", "1");
    router.push(`${pathname}?${p}`);
  };

  const toggle = (id: number) =>
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // CSV — Excel'da ochish uchun (BOM bilan, kirill/lotin buzilmasin)
  const csv = () => {
    const head = ["Bo'lim", "Guruh", "Modda", ...months.map(oyLabel), "Jami"];
    const lines = [head.join(";")];
    for (const s of tree) {
      for (const g of s.groups) {
        for (const a of g.articles) {
          const vals = a.byMonth.map((c) => String(sof(c)));
          const jami = a.byMonth.reduce((x, c) => x + sof(c), 0);
          lines.push(
            [SECTION_META[s.section]?.label ?? s.section, g.name, a.name, ...vals, String(jami)]
              .map((v) => `"${v.replace(/"/g, '""')}"`)
              .join(";")
          );
        }
      }
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dds_${filters.from}_${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Davr
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Dan</Label>
            <Input
              type="date"
              defaultValue={filters.from}
              onChange={(e) => apply({ from: e.target.value })}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Gacha</Label>
            <Input
              type="date"
              defaultValue={filters.to}
              onChange={(e) => apply({ to: e.target.value })}
              className="h-8 w-[150px] text-xs"
            />
          </div>
          <Button
            size="sm"
            variant={filters.neytral ? "default" : "outline"}
            onClick={() => apply({ neytral: !filters.neytral })}
            className="h-8 gap-1.5 text-xs"
          >
            <ShieldOff className="h-3.5 w-3.5" />
            {filters.neytral ? "Neytral ko'rinmoqda" : "Neytralni ko'rsatish"}
          </Button>
          <Button size="sm" variant="outline" onClick={csv} className="ml-auto h-8 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </CardContent>
      </Card>

      {tree.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="Ma'lumot yo'q"
          description="Tanlangan davrda kassa yozuvi topilmadi."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto py-3">
            <div className={cn(months.length > 3 && "min-w-[760px]")}>
              {/* Sarlavha */}
              <div className="flex items-center gap-2 border-b border-border px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="flex-1">Modda</span>
                {months.map((m) => (
                  <span key={m} className="w-[92px] shrink-0 text-right">
                    {oyLabel(m)}
                  </span>
                ))}
                <span className="w-[104px] shrink-0 text-right">Jami</span>
              </div>

              {tree.map((s) => {
                const meta = SECTION_META[s.section] ?? {
                  label: s.section,
                  hint: "",
                  accent: "border-l-border",
                };
                // Bo'lim jami — har oy bo'yicha
                const secTotals = months.map((_, i) =>
                  s.groups.reduce(
                    (sum, g) => sum + g.articles.reduce((x, a) => x + sof(a.byMonth[i]), 0),
                    0
                  )
                );
                return (
                  <div key={s.section} className={cn("mt-3 border-l-2 pl-2", meta.accent)}>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="flex-1">
                        <span className="text-sm font-semibold">{meta.label}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">{meta.hint}</span>
                      </span>
                      {secTotals.map((v, i) => (
                        <Son key={i} v={v} bold />
                      ))}
                      <Son v={secTotals.reduce((a, b) => a + b, 0)} bold wide />
                    </div>

                    {s.groups.map((g) => {
                      const open = openGroups.has(g.id);
                      const gTotals = months.map((_, i) =>
                        g.articles.reduce((x, a) => x + sof(a.byMonth[i]), 0)
                      );
                      return (
                        <div key={g.id}>
                          <button
                            type="button"
                            onClick={() => toggle(g.id)}
                            aria-expanded={open}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                open && "rotate-90"
                              )}
                            />
                            <span className="flex-1 truncate text-[13px]">{g.name}</span>
                            {gTotals.map((v, i) => (
                              <Son key={i} v={v} />
                            ))}
                            <Son v={gTotals.reduce((a, b) => a + b, 0)} wide />
                          </button>

                          {open && (
                            <div className="mb-1 ml-[18px] space-y-0.5 border-l border-border/50 pl-2">
                              {g.articles.map((a) => (
                                <div key={a.id} className="flex items-center gap-2 py-1 pl-2">
                                  <span className="flex flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground">
                                    {a.name}
                                    {a.isNeutral && (
                                      <ShieldOff className="h-3 w-3 shrink-0 text-violet-500" />
                                    )}
                                  </span>
                                  {a.byMonth.map((c, i) => (
                                    <Son key={i} v={sof(c)} small />
                                  ))}
                                  <Son
                                    v={a.byMonth.reduce((x, c) => x + sof(c), 0)}
                                    small
                                    wide
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Sof qiymat: musbat — kirim (yashil), manfiy — chiqim (qizil), nol — chiziqcha. */
function Son({ v, bold, small, wide }: { v: number; bold?: boolean; small?: boolean; wide?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 text-right tabular-nums",
        wide ? "w-[104px]" : "w-[92px]",
        small ? "text-[11px]" : "text-xs",
        bold && "font-semibold",
        v === 0 ? "text-muted-foreground/40" : v > 0 ? "text-primary" : "text-destructive"
      )}
    >
      {v === 0 ? "—" : formatUZS(v, { compact: true })}
    </span>
  );
}
