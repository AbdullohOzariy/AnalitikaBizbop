"use client";

import { Fragment as FragmentG, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import type { AnalizGroup, AnalizCat, AnalizSub, SkuAnaliz, AbcClass, XyzClass, ClassCounts } from "@/lib/abc-xyz";

type Mode = "abc" | "xyz";

const ABC_TONE: Record<AbcClass, "green" | "amber" | "muted"> = { A: "green", B: "amber", C: "muted" };
const XYZ_TONE: Record<XyzClass, "green" | "amber" | "red"> = { X: "green", Y: "amber", Z: "red" };

function pct(v: number, digits = 1): string {
  return (v * 100).toFixed(digits) + "%";
}

/** Tugun ichidagi sinf taqsimoti: A 12 · B 4 · C 9 ko'rinishida. */
function CountChips({ counts, mode }: { counts: ClassCounts; mode: Mode }) {
  const keys = (mode === "abc" ? ["A", "B", "C"] : ["X", "Y", "Z"]) as (AbcClass | XyzClass)[];
  return (
    <span className="hidden items-center gap-1 sm:inline-flex">
      {keys.map((k) => {
        const n = counts[k];
        if (n === 0) return null;
        const tone = mode === "abc" ? ABC_TONE[k as AbcClass] : XYZ_TONE[k as XyzClass];
        return (
          <Pill key={k} tone={tone} className="px-1.5 py-0 text-[10px]">
            {k} {n.toLocaleString("uz-UZ")}
          </Pill>
        );
      })}
    </span>
  );
}

function SkuRow({ s, mode }: { s: SkuAnaliz; mode: Mode }) {
  return (
    <tr className="border-b border-border/30 text-xs hover:bg-muted/10">
      <td className="py-1.5 pl-[5.5rem] pr-3">
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.code}</span>
          <span className="line-clamp-2 leading-snug text-foreground/90">{s.name}</span>
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatUZS(s.total)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(s.share, 2)}</td>
      {mode === "abc" ? (
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(s.cum)}</td>
      ) : (
        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(s.cv, 0)}</td>
      )}
      <td className="py-1.5 pl-2 pr-3 text-right">
        <Pill tone={mode === "abc" ? ABC_TONE[s.abc] : XYZ_TONE[s.xyz]} className="px-2 py-0 text-[10px] font-bold">
          {mode === "abc" ? s.abc : s.xyz}
        </Pill>
      </td>
    </tr>
  );
}

/** Ochiladigan tugun qatori (guruh/kategoriya/subkat uchun umumiy). */
function NodeRow({
  name, total, share, counts, mode, depth, open, onToggle,
}: {
  name: string; total: number; share: number; counts: ClassCounts;
  mode: Mode; depth: 0 | 1 | 2; open: boolean; onToggle: () => void;
}) {
  const pad = ["pl-3", "pl-9", "pl-[3.75rem]"][depth];
  const style = [
    "border-b border-border bg-muted/30 font-bold hover:bg-muted/50",
    "border-b border-border/60 font-semibold hover:bg-muted/20",
    "border-b border-border/40 hover:bg-muted/10",
  ][depth];
  return (
    <tr
      className={cn("cursor-pointer text-sm", style)}
      onClick={onToggle}
      tabIndex={0}
      role="button"
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
      }}
    >
      <td className={cn("py-2 pr-3", pad)}>
        <span className="flex items-center gap-1.5">
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-90")} />
          <span className="truncate">{name}</span>
          <CountChips counts={counts} mode={mode} />
        </span>
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs">{formatUZS(total)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-muted-foreground">{pct(share)}</td>
      <td />
      <td />
    </tr>
  );
}

export function AnalizTree({ groups, mode }: { groups: AnalizGroup[]; mode: Mode }) {
  const [openG, setOpenG] = useState<Set<number>>(new Set());
  const [openC, setOpenC] = useState<Set<string>>(new Set());
  const [openS, setOpenS] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const toggle = <T,>(set: Set<T>, val: T, save: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    save(next);
  };

  // Qidiruv: SKU nomi/kodi bo'yicha; mos kelgan shoxlar to'liq ochiq ko'rsatiladi.
  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return groups;
    const out: AnalizGroup[] = [];
    for (const g of groups) {
      const cats: AnalizCat[] = [];
      for (const c of g.cats) {
        const subs: AnalizSub[] = [];
        for (const s of c.subs) {
          const skus = s.skus.filter(
            (k) => k.name.toLowerCase().includes(query) || String(k.code).includes(query)
          );
          if (skus.length > 0) subs.push({ ...s, skus });
        }
        if (subs.length > 0) cats.push({ ...c, subs });
      }
      if (cats.length > 0) out.push({ ...g, cats });
    }
    return out;
  }, [groups, query]);

  const forceOpen = query.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SKU nomi yoki kodi..."
            className="h-8 pl-8 text-xs"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Qidiruvni tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">Guruh / Kategoriya / Subkat / SKU</th>
              <th className="w-[130px] px-2 py-2.5 text-right font-semibold">Savdo</th>
              <th className="w-[80px] px-2 py-2.5 text-right font-semibold">Ulush</th>
              <th className="w-[80px] px-2 py-2.5 text-right font-semibold">
                {mode === "abc" ? "Jami %" : "CV"}
              </th>
              <th className="w-[70px] py-2.5 pl-2 pr-3 text-right font-semibold">Sinf</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs italic text-muted-foreground">
                  Hech narsa topilmadi
                </td>
              </tr>
            )}
            {filtered.map((g) => {
              const gOpen = forceOpen || openG.has(g.id);
              return (
                <FragmentG key={g.id}>
                  <NodeRow
                    name={g.name} total={g.total} share={g.share} counts={g.counts}
                    mode={mode} depth={0} open={gOpen}
                    onToggle={() => toggle(openG, g.id, setOpenG)}
                  />
                  {gOpen && g.cats.map((c) => {
                    const cKey = `${g.id}_${c.id}`;
                    const cOpen = forceOpen || openC.has(cKey);
                    return (
                      <FragmentG key={cKey}>
                        <NodeRow
                          name={c.name} total={c.total} share={c.share} counts={c.counts}
                          mode={mode} depth={1} open={cOpen}
                          onToggle={() => toggle(openC, cKey, setOpenC)}
                        />
                        {cOpen && c.subs.map((s) => {
                          const sKey = `${cKey}_${s.id}`;
                          const sOpen = forceOpen || openS.has(sKey);
                          return (
                            <FragmentG key={sKey}>
                              <NodeRow
                                name={s.name} total={s.total} share={s.share} counts={s.counts}
                                mode={mode} depth={2} open={sOpen}
                                onToggle={() => toggle(openS, sKey, setOpenS)}
                              />
                              {sOpen && s.skus.map((sku) => <SkuRow key={sku.id} s={sku} mode={mode} />)}
                            </FragmentG>
                          );
                        })}
                      </FragmentG>
                    );
                  })}
                </FragmentG>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
