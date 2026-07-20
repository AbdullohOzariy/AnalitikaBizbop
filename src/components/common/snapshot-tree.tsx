"use client";

/**
 * OOS/Stockday uchun umumiy iyerarxik jadval: Guruh → Kategoriya → Subkat →
 * SKU×filial barglari (subkat ochilganda server action orqali lazy yuklanadi).
 *
 * Ustun boshqaruvlari:
 *  - sarlavhani bosish — saralash (asc/desc), yuklangan barglar ichida
 *  - filtr qatori — matn (kod/nom), filial (select), raqamli min–max oraliq
 *    (filtrlar yuklangan SKU qatorlariga qo'llanadi; global filtr — yuqori panel)
 */
import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronRight, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { skuRowBg, skuBadgeCls, skuBadgeLabel, skuBadgeTitle } from "@/lib/sku-rang";
import type { SnapTreeGroup } from "@/lib/snapshot-reports";

// ─── Ustun spetsifikatsiyasi ──────────────────────────────────────────────────

export type SnapCol = {
  key: string;
  label: string;
  width?: string;
  type: "text" | "num" | "money" | "days" | "date";
  filter?: "text" | "select" | "range";
  /** Qiymat Pill ichida (masalan, zaxira kunlari) */
  pill?: boolean;
  /** Stockday "Keladi": qiymat stockDays'dan katta bo'lsa qizil ⚠ */
  risk?: boolean;
};

export type LeafRow = Record<string, unknown> & {
  productId: number;
  branchId: number;
  code: number;
  pname: string;
  abc?: string | null;
  xyz?: string | null;
};

type LeafResult = { ok: true; rows: LeafRow[]; truncated: boolean } | { ok: false; error: string };

type ColFilter = { q?: string; min?: string; max?: string; sel?: string };

const NF = new Intl.NumberFormat("uz-UZ");

function fmtCell(col: SnapCol, v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  switch (col.type) {
    case "money":
      return isNaN(n) || n === 0 ? "—" : NF.format(Math.round(n));
    case "num":
      return isNaN(n) ? "—" : NF.format(Math.round(n * 100) / 100);
    case "days":
      if (isNaN(n)) return "—";
      if (n >= 999) return "999+ kun";
      if (n > 0 && n < 1) return "<1 kun";
      return `${NF.format(Math.round(n * 10) / 10)} kun`;
    case "date":
      return String(v).slice(0, 10);
    default:
      return String(v);
  }
}

// ─── Asosiy komponent ─────────────────────────────────────────────────────────

export function SnapshotTree({
  groups,
  cols,
  ctx,
  loadLeaves,
  pillTone = "muted",
  totalLabel,
  rateTone = "severity",
}: {
  groups: SnapTreeGroup[];
  cols: SnapCol[];
  /** Leaf action'ga uzatiladigan kontekst (filtrlar, view, todayStr...) */
  ctx: Record<string, string | number | undefined>;
  loadLeaves: (input: never) => Promise<LeafResult>;
  /** Pill ustunlari ohangi (joriy tab rangiga mos) */
  pillTone?: "red" | "amber" | "green" | "blue" | "muted";
  /** Tugun qatoridagi summa izohi: "savdo" | "qoldiq qiymati" */
  totalLabel: string;
  /**
   * Tugun nomi oldidagi ulush foizining rangi:
   *  - "severity" — foiz qancha katta, shuncha yomon (OOS, tugash xavfi, kritik)
   *  - "neutral"  — yuqori foiz yomon emas (Normal zaxira, o'lik qoldiq)
   */
  rateTone?: RateTone;
}) {
  const [openG, setOpenG] = useState<Set<number>>(new Set());
  const [openC, setOpenC] = useState<Set<string>>(new Set());
  const [openS, setOpenS] = useState<Set<string>>(new Set());
  const [leaves, setLeaves] = useState<Record<string, { rows: LeafRow[]; truncated: boolean }>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [, startLoad] = useTransition();

  // Ustun filtrlari + saralash
  const [filters, setFilters] = useState<Record<string, ColFilter>>({});
  const [nomKod, setNomKod] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const toggle = <T,>(set: Set<T>, val: T, save: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    save(next);
  };

  const toggleSub = (sKey: string, subId: number) => {
    const willOpen = !openS.has(sKey);
    toggle(openS, sKey, setOpenS);
    if (!willOpen || leaves[sKey] || loading.has(sKey)) return;
    setLoading((p) => new Set(p).add(sKey));
    startLoad(async () => {
      const res = await loadLeaves({ ...ctx, subId } as never);
      if (res.ok) setLeaves((p) => ({ ...p, [sKey]: { rows: res.rows, truncated: res.truncated } }));
      setLoading((p) => { const n = new Set(p); n.delete(sKey); return n; });
    });
  };

  // Filial select variantlari — yuklangan barglardan
  const branchOptions = useMemo(() => {
    const s = new Set<string>();
    for (const l of Object.values(leaves)) for (const r of l.rows) s.add(String(r.bname ?? ""));
    return [...s].filter(Boolean).sort();
  }, [leaves]);

  const setF = (key: string, patch: Partial<ColFilter>) =>
    setFilters((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const hasActiveFilter =
    nomKod.trim() !== "" ||
    Object.values(filters).some((f) => (f.q ?? "") !== "" || (f.min ?? "") !== "" || (f.max ?? "") !== "" || (f.sel ?? "") !== "");

  const applyFilters = (rows: LeafRow[]): LeafRow[] => {
    let out = rows;
    const nk = nomKod.trim().toLowerCase();
    if (nk) out = out.filter((r) => r.pname.toLowerCase().includes(nk) || String(r.code).includes(nk));
    for (const col of cols) {
      const f = filters[col.key];
      if (!f) continue;
      if (col.filter === "text" && f.q) {
        const q = f.q.toLowerCase();
        out = out.filter((r) => String(r[col.key] ?? "").toLowerCase().includes(q));
      }
      if (col.filter === "select" && f.sel) {
        out = out.filter((r) => String(r[col.key] ?? "") === f.sel);
      }
      if (col.filter === "range") {
        const min = f.min !== undefined && f.min !== "" ? Number(f.min) : null;
        const max = f.max !== undefined && f.max !== "" ? Number(f.max) : null;
        if (min != null) out = out.filter((r) => r[col.key] != null && Number(r[col.key]) >= min);
        if (max != null) out = out.filter((r) => r[col.key] != null && Number(r[col.key]) <= max);
      }
    }
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      out = [...out].sort((a, b) => {
        const av = a[sort.key]; const bv = b[sort.key];
        if (col && col.type !== "text" && col.type !== "date") {
          const an = av == null ? -Infinity : Number(av);
          const bn = bv == null ? -Infinity : Number(bv);
          return (an - bn) * sort.dir;
        }
        return String(av ?? "").localeCompare(String(bv ?? ""), "uz") * sort.dir;
      });
    }
    return out;
  };

  const onSort = (key: string) =>
    setSort((p) => (p?.key === key ? (p.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th className="px-3 py-2.5 font-semibold">Guruh / Kategoriya / Subkat / SKU</th>
            {cols.map((c) => (
              <th
                key={c.key}
                className={cn("cursor-pointer select-none px-2 py-2.5 text-right font-semibold hover:text-foreground", c.width)}
                onClick={() => onSort(c.key)}
                title="Saralash"
              >
                <span className="inline-flex items-center gap-0.5">
                  {c.label}
                  {sort?.key === c.key && (sort.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                </span>
              </th>
            ))}
          </tr>
          {/* Ustun filtrlari qatori (ochilgan SKU qatorlariga qo'llanadi) */}
          <tr className="border-b border-border/60 bg-muted/20">
            <td className="px-3 py-1.5">
              <Input value={nomKod} onChange={(e) => setNomKod(e.target.value)}
                placeholder="SKU nomi / kodi..." className="h-7 max-w-[220px] text-xs" />
            </td>
            {cols.map((c) => (
              <td key={c.key} className="px-1 py-1.5">
                {c.filter === "text" && (
                  <Input value={filters[c.key]?.q ?? ""} onChange={(e) => setF(c.key, { q: e.target.value })}
                    placeholder="..." className="h-7 text-xs" />
                )}
                {c.filter === "select" && (
                  <select
                    value={filters[c.key]?.sel ?? ""}
                    onChange={(e) => setF(c.key, { sel: e.target.value })}
                    className="h-7 w-full rounded-md border border-input bg-background px-1 text-xs"
                  >
                    <option value="">Barchasi</option>
                    {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
                {c.filter === "range" && (
                  <span className="flex gap-1">
                    <Input value={filters[c.key]?.min ?? ""} onChange={(e) => setF(c.key, { min: e.target.value })}
                      placeholder="dan" inputMode="decimal" className="h-7 w-1/2 px-1 text-right text-[10px]" />
                    <Input value={filters[c.key]?.max ?? ""} onChange={(e) => setF(c.key, { max: e.target.value })}
                      placeholder="gacha" inputMode="decimal" className="h-7 w-1/2 px-1 text-right text-[10px]" />
                  </span>
                )}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const gOpen = openG.has(g.id);
            return (
              <Fragment key={g.id}>
                <NodeRow depth={0} open={gOpen} name={g.name} cnt={g.cnt} tot={g.tot} total={g.total}
                  totalLabel={totalLabel} rateTone={rateTone} colSpan={cols.length}
                  onToggle={() => toggle(openG, g.id, setOpenG)} />
                {gOpen && g.cats.map((c) => {
                  const cKey = `${g.id}_${c.id}`;
                  const cOpen = openC.has(cKey);
                  return (
                    <Fragment key={cKey}>
                      <NodeRow depth={1} open={cOpen} name={c.name} cnt={c.cnt} tot={c.tot} total={c.total}
                        totalLabel={totalLabel} rateTone={rateTone} colSpan={cols.length}
                        onToggle={() => toggle(openC, cKey, setOpenC)} />
                      {cOpen && c.subs.map((s) => {
                        const sKey = `${cKey}_${s.id}`;
                        const sOpen = openS.has(sKey);
                        const leaf = leaves[sKey];
                        const isLoading = loading.has(sKey);
                        const shown = leaf ? applyFilters(leaf.rows) : [];
                        return (
                          <Fragment key={sKey}>
                            <NodeRow depth={2} open={sOpen} name={s.name} cnt={s.cnt} tot={s.tot} total={s.total}
                              totalLabel={totalLabel} rateTone={rateTone} colSpan={cols.length} loading={isLoading}
                              onToggle={() => toggleSub(sKey, s.id)} />
                            {sOpen && leaf && (
                              <>
                                {shown.map((r) => (
                                  <tr key={`${r.productId}_${r.branchId}`}
                                    className={cn("border-b border-border/30 text-xs", skuRowBg(r.abc, r.xyz))}>
                                    <td className="py-1.5 pl-[5.5rem] pr-3">
                                      <span className="flex items-baseline gap-2">
                                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{r.code}</span>
                                        <span title={skuBadgeTitle(r.abc, r.xyz)}
                                          className={cn("shrink-0 rounded border px-1 py-px text-[9px] font-bold leading-none",
                                            skuBadgeCls(r.abc, r.xyz))}>
                                          {skuBadgeLabel(r.abc, r.xyz)}
                                        </span>
                                        <span className="line-clamp-2 leading-snug text-foreground/90">{r.pname}</span>
                                      </span>
                                    </td>
                                    {cols.map((c) => <LeafCell key={c.key} col={c} row={r} pillTone={pillTone} />)}
                                  </tr>
                                ))}
                                {shown.length === 0 && (
                                  <tr><td colSpan={cols.length + 1} className="py-3 text-center text-[11px] italic text-muted-foreground">
                                    {hasActiveFilter ? "Filtrga mos SKU yo'q" : "SKU yo'q"}
                                  </td></tr>
                                )}
                                {leaf.truncated && (
                                  <tr><td colSpan={cols.length + 1} className="py-1.5 text-center text-[10px] italic text-muted-foreground">
                                    Birinchi 500 ta ko'rsatildi — aniqroq ko'rish uchun yuqori paneldan filial/qidiruv filtrini qo'llang
                                  </td></tr>
                                )}
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tugun qatori ─────────────────────────────────────────────────────────────

export type RateTone = "severity" | "neutral";

// Ulush foizi: tugundagi joriy holatdagi qatorlar ÷ tugundagi jami faol qatorlar.
// "severity"da 20%+ qizil, 10%+ sariq — qaysi bo'lim eng muammoli ekani ko'rinsin.
function rateBadgeTone(pct: number, mode: RateTone): "red" | "amber" | "muted" {
  if (mode === "neutral") return "muted";
  if (pct >= 20) return "red";
  if (pct >= 10) return "amber";
  return "muted";
}

function fmtPct(pct: number): string {
  if (pct > 0 && pct < 0.1) return "<0,1%";
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

function NodeRow({
  depth, open, name, cnt, tot, total, totalLabel, rateTone, colSpan, loading, onToggle,
}: {
  depth: 0 | 1 | 2; open: boolean; name: string; cnt: number; tot: number; total: number;
  totalLabel: string; rateTone: RateTone; colSpan: number; loading?: boolean; onToggle: () => void;
}) {
  const pct = tot > 0 ? (cnt / tot) * 100 : null;
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
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
    >
      <td className={cn("py-2 pr-3", pad)}>
        <span className="flex items-center gap-1.5">
          {loading
            ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />
            : <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-90")} />}
          {pct != null && (
            <span className="shrink-0" title={`${NF.format(cnt)} / ${NF.format(tot)} SKU×filial`}>
              <Pill tone={rateBadgeTone(pct, rateTone)} className="px-1.5 py-0 text-[10px] font-bold tabular-nums">
                {fmtPct(pct)}
              </Pill>
            </span>
          )}
          <span className="truncate">{name}</span>
          <span className="text-[10px] font-normal text-muted-foreground">{NF.format(cnt)} ta</span>
        </span>
      </td>
      <td colSpan={colSpan} className="px-2 py-2 text-right tabular-nums text-xs text-muted-foreground">
        {total > 0 && <>{NF.format(Math.round(total))} <span className="text-[10px]">({totalLabel})</span></>}
      </td>
    </tr>
  );
}

// ─── Barg katagi ──────────────────────────────────────────────────────────────

function LeafCell({ col, row, pillTone }: { col: SnapCol; row: LeafRow; pillTone: "red" | "amber" | "green" | "blue" | "muted" }) {
  const v = row[col.key];
  const text = fmtCell(col, v);

  // Stockday "Keladi": yetib kelish > zaxira kunlari — kechikish xavfi
  if (col.risk) {
    const arrival = v == null ? null : Number(v);
    const stockDays = row["stockDays"] != null ? Number(row["stockDays"]) : null;
    if (arrival == null) return <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>;
    const danger = stockDays != null && stockDays < arrival;
    return (
      <td className="px-2 py-1.5 text-right">
        {danger
          ? <Pill tone="red" className="gap-1 px-2 py-0 text-[10px] font-bold">⚠ {text}</Pill>
          : <span className="tabular-nums text-muted-foreground">{text}</span>}
      </td>
    );
  }

  if (col.pill && text !== "—") {
    return (
      <td className="px-2 py-1.5 text-right">
        <Pill tone={pillTone} className="px-2 py-0 text-[10px]">{text}</Pill>
      </td>
    );
  }

  return (
    <td className={cn("px-2 py-1.5 tabular-nums", col.type === "text" ? "text-left" : "text-right",
      col.type === "money" ? "font-medium" : "text-muted-foreground")}>
      {text}
    </td>
  );
}
