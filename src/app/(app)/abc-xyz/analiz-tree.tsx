"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { ChevronRight, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { skuRowBg } from "@/lib/sku-rang";
import { toast } from "sonner";
import type {
  AnalizGroupLite, SkuAnaliz, AbcClass, XyzClass, ClassCounts,
} from "@/lib/abc-xyz";
import { loadSubSkusAction, searchSkusAbcAction } from "./actions";

type Mode = "abc" | "xyz";
type Ctx = { start: string; end: string; branchId?: number };

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

function SkuRow({ s, mode, showPath }: { s: SkuAnaliz; mode: Mode; showPath?: boolean }) {
  return (
    // Fon — SKU'ning matritsa holatiga ko'ra (butun tizimdagi rang tili bilan bir xil)
    <tr className={cn("border-b border-border/30 text-xs", skuRowBg(s.abc, s.xyz) || "hover:bg-muted/10")}>
      <td className={cn("py-1.5 pr-3", showPath ? "pl-3" : "pl-[5.5rem]")}>
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.code}</span>
          <span className="min-w-0">
            <span className="line-clamp-2 leading-snug text-foreground/90">{s.name}</span>
            {showPath && (
              <span className="block truncate text-[10px] text-muted-foreground">
                {s.groupName ?? "Moslanmagan"} → {s.catName ?? "—"} → {s.subName ?? "—"}
              </span>
            )}
          </span>
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
  name, total, share, counts, mode, depth, open, loading, onToggle, suffix,
}: {
  name: string; total: number; share: number; counts: ClassCounts;
  mode: Mode; depth: 0 | 1 | 2; open: boolean; loading?: boolean;
  onToggle: () => void; suffix?: string;
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
          {loading
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />
            : <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-90")} />}
          <span className="truncate">{name}</span>
          {suffix && <span className="text-[10px] font-normal text-muted-foreground">{suffix}</span>}
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

export function AnalizTree({ groups, mode, ctx }: { groups: AnalizGroupLite[]; mode: Mode; ctx: Ctx }) {
  const [openG, setOpenG] = useState<Set<number>>(new Set());
  const [openC, setOpenC] = useState<Set<string>>(new Set());
  const [openS, setOpenS] = useState<Set<string>>(new Set());
  // sKey → SKU'lar (lazy yuklangan)
  const [skus, setSkus] = useState<Record<string, SkuAnaliz[]>>({});
  const [loadingS, setLoadingS] = useState<Set<string>>(new Set());
  const [, startLoad] = useTransition();

  // Qidiruv — server tomonda (SKU'lar payload'da yo'q)
  const [qInput, setQInput] = useState("");
  const [hits, setHits] = useState<SkuAnaliz[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [searching, startSearch] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggle = <T,>(set: Set<T>, val: T, save: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    save(next);
  };

  const toggleSub = (sKey: string, catId: number, subId: number) => {
    const willOpen = !openS.has(sKey);
    toggle(openS, sKey, setOpenS);
    if (!willOpen || skus[sKey] || loadingS.has(sKey)) return;
    setLoadingS((prev) => new Set(prev).add(sKey));
    startLoad(async () => {
      const res = await loadSubSkusAction({ ...ctx, catId, subId });
      if (res.ok) setSkus((prev) => ({ ...prev, [sKey]: res.data }));
      else toast.error(res.error);
      setLoadingS((prev) => { const n = new Set(prev); n.delete(sKey); return n; });
    });
  };

  const onSearch = (v: string) => {
    setQInput(v);
    clearTimeout(debounce.current);
    const q = v.trim();
    if (q.length < 2) { setHits(null); return; }
    debounce.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchSkusAbcAction({ ...ctx, q });
        if (res.ok) { setHits(res.data.hits); setTruncated(res.data.truncated); }
        else toast.error(res.error);
      });
    }, 350);
  };

  const searchActive = qInput.trim().length >= 2;

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="SKU nomi yoki kodi (kamida 2 belgi)..."
            className="h-8 pl-8 text-xs"
          />
          {qInput && (
            <button
              onClick={() => { setQInput(""); setHits(null); }}
              aria-label="Qidiruvni tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {searchActive && hits && (
          <span className="text-xs text-muted-foreground">
            {hits.length}{truncated ? "+" : ""} ta topildi
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">
                {searchActive ? "Qidiruv natijalari" : "Guruh / Kategoriya / Subkat / SKU"}
              </th>
              <th className="w-[130px] px-2 py-2.5 text-right font-semibold">Savdo</th>
              <th className="w-[80px] px-2 py-2.5 text-right font-semibold">Ulush</th>
              <th className="w-[80px] px-2 py-2.5 text-right font-semibold">
                {mode === "abc" ? "Jami %" : "CV"}
              </th>
              <th className="w-[70px] py-2.5 pl-2 pr-3 text-right font-semibold">Sinf</th>
            </tr>
          </thead>
          <tbody>
            {searchActive ? (
              !hits || hits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs italic text-muted-foreground">
                    {searching ? "Qidirilmoqda..." : "Hech narsa topilmadi"}
                  </td>
                </tr>
              ) : (
                hits.map((s) => <SkuRow key={s.id} s={s} mode={mode} showPath />)
              )
            ) : (
              groups.map((g) => {
                const gOpen = openG.has(g.id);
                return (
                  <Fragment key={g.id}>
                    <NodeRow
                      name={g.name} total={g.total} share={g.share} counts={g.counts}
                      mode={mode} depth={0} open={gOpen}
                      onToggle={() => toggle(openG, g.id, setOpenG)}
                    />
                    {gOpen && g.cats.map((c) => {
                      const cKey = `${g.id}_${c.id}`;
                      const cOpen = openC.has(cKey);
                      return (
                        <Fragment key={cKey}>
                          <NodeRow
                            name={c.name} total={c.total} share={c.share} counts={c.counts}
                            mode={mode} depth={1} open={cOpen}
                            onToggle={() => toggle(openC, cKey, setOpenC)}
                          />
                          {cOpen && c.subs.map((s) => {
                            const sKey = `${cKey}_${s.id}`;
                            const sOpen = openS.has(sKey);
                            const sLoading = loadingS.has(sKey);
                            return (
                              <Fragment key={sKey}>
                                <NodeRow
                                  name={s.name} total={s.total} share={s.share} counts={s.counts}
                                  mode={mode} depth={2} open={sOpen} loading={sLoading}
                                  suffix={`${s.skuCount.toLocaleString("uz-UZ")} SKU`}
                                  onToggle={() => toggleSub(sKey, c.id, s.id)}
                                />
                                {sOpen && skus[sKey]?.map((sku) => <SkuRow key={sku.id} s={sku} mode={mode} />)}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
            {!searchActive && groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs italic text-muted-foreground">
                  Ma&apos;lumot yo&apos;q
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
