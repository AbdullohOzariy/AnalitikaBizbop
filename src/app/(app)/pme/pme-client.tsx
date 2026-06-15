"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, X, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP_COLORS, norm } from "../iyerarxiya/colors";
import type { Segment } from "@/generated/prisma/enums";
import {
  pmeSuppliersAction, pmeSupplierSkusAction, pmeAnalyzeAction,
  setSkuSegmentAction, bulkSetSegmentAction,
  type PmeSku, type SupplierLite,
} from "./actions";

// ─── Segment konfiguratsiyasi (Premium / Medium / Easy) ───────────────────────
type SegCfg = { v: Segment; short: string; label: string; dot: string; badge: string; active: string; bulkHover: string };
const SEGMENTS: SegCfg[] = [
  { v: "PREMIUM", short: "P", label: "Premium", dot: "bg-amber-500", badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", active: "bg-amber-500 text-white", bulkHover: "hover:bg-amber-500 hover:text-white" },
  { v: "MEDIUM", short: "M", label: "Medium", dot: "bg-sky-500", badge: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400", active: "bg-sky-500 text-white", bulkHover: "hover:bg-sky-500 hover:text-white" },
  { v: "EASY", short: "E", label: "Easy", dot: "bg-emerald-500", badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", active: "bg-emerald-500 text-white", bulkHover: "hover:bg-emerald-500 hover:text-white" },
];
const SEG_BY = new Map(SEGMENTS.map((s) => [s.v, s]));
const leafCat = (it: PmeSku): number | null => it.subId ?? it.catId;

// ─── Iyerarxiya daraxti (guruh → kategoriya → subkat/to'g'ridan → SKU) ─────────
type SubNode = { id: number; name: string; sort: number; items: PmeSku[] };
type CatNode = { id: number; name: string; sort: number; subs: SubNode[]; direct: PmeSku[] };
type GroupNode = { id: number; name: string; sort: number; cats: CatNode[]; count: number };

function buildTree(items: PmeSku[]): GroupNode[] {
  const gMap = new Map<number, { id: number; name: string; sort: number; cats: Map<number, { id: number; name: string; sort: number; subs: Map<number, SubNode>; direct: PmeSku[] }> }>();
  for (const it of items) {
    const gid = it.groupId ?? -1;
    let g = gMap.get(gid);
    if (!g) { g = { id: gid, name: it.groupName ?? "Boshqa", sort: it.groupSort, cats: new Map() }; gMap.set(gid, g); }
    const cid = it.catId ?? -1;
    let c = g.cats.get(cid);
    if (!c) { c = { id: cid, name: it.catName ?? "Boshqa", sort: it.catSort, subs: new Map(), direct: [] }; g.cats.set(cid, c); }
    if (it.subId != null) {
      let s = c.subs.get(it.subId);
      if (!s) { s = { id: it.subId, name: it.subName ?? "—", sort: it.subSort, items: [] }; c.subs.set(it.subId, s); }
      s.items.push(it);
    } else c.direct.push(it);
  }
  const bySort = <T extends { id: number; sort: number; name: string }>(a: T, b: T) =>
    (a.id < 0 ? 1 : 0) - (b.id < 0 ? 1 : 0) || a.sort - b.sort || a.name.localeCompare(b.name, "uz");
  return [...gMap.values()].sort(bySort).map((g) => {
    let count = 0;
    const cats: CatNode[] = [...g.cats.values()].sort(bySort).map((c) => {
      count += c.direct.length;
      for (const s of c.subs.values()) count += s.items.length;
      return { id: c.id, name: c.name, sort: c.sort, subs: [...c.subs.values()].sort(bySort), direct: c.direct };
    });
    return { id: g.id, name: g.name, sort: g.sort, cats, count };
  });
}

function makeToggle<T>(set: React.Dispatch<React.SetStateAction<Set<T>>>) {
  return (id: T) => set((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
}

// Bitta SKU qatorining o'ng tomoni (tahrir tugmalari yoki badge) + leaf bulk slot prop
function SkuTree({
  items, renderRight, renderBulk, searching,
}: {
  items: PmeSku[];
  renderRight: (it: PmeSku) => React.ReactNode;
  renderBulk?: (leafCatId: number, count: number) => React.ReactNode;
  searching: boolean;
}) {
  const tree = useMemo(() => buildTree(items), [items]);
  const [closedG, setClosedG] = useState<Set<number>>(new Set());
  const [closedC, setClosedC] = useState<Set<string>>(new Set());
  const [closedS, setClosedS] = useState<Set<number>>(new Set());
  const toggleG = makeToggle(setClosedG);
  const toggleC = makeToggle(setClosedC);
  const toggleS = makeToggle(setClosedS);

  if (tree.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">SKU topilmadi.</p>;
  }

  const SkuRow = (it: PmeSku) => (
    <div key={it.productId} className="flex items-center gap-2 border-b border-border/30 py-1 pl-12 pr-3 text-sm hover:bg-muted/20">
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{it.code}</span>
      <span className="min-w-0 flex-1 truncate" title={it.name}>{it.name}</span>
      {it.arxiv && (
        <span className="shrink-0 rounded border border-border bg-muted px-1 py-px text-[9px] font-semibold uppercase text-muted-foreground">no aktiv</span>
      )}
      {renderRight(it)}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {tree.map((g) => {
        const gOpen = searching || !closedG.has(g.id);
        const col = GROUP_COLORS[norm(g.name)] ?? { dot: "bg-muted-foreground", badge: "" };
        return (
          <Fragment key={`g${g.id}`}>
            <button type="button" onClick={() => toggleG(g.id)}
              className="flex w-full items-center gap-2 bg-muted/60 px-3 py-1.5 text-left text-sm font-bold hover:bg-muted/70">
              <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", gOpen && "rotate-90")} />
              <span className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
              {g.name}
              <span className="text-[11px] font-normal text-muted-foreground">{g.count} SKU</span>
            </button>
            {gOpen && g.cats.map((c) => {
              const cKey = `${g.id}:${c.id}`;
              const cOpen = searching || !closedC.has(cKey);
              const cCount = c.direct.length + c.subs.reduce((s, x) => s + x.items.length, 0);
              return (
                <Fragment key={`c${cKey}`}>
                  <div className="flex items-center gap-2 bg-muted/25 px-3 py-1 pl-6 hover:bg-muted/40">
                    <button type="button" onClick={() => toggleC(cKey)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold">
                      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", cOpen && "rotate-90")} />
                      <span className="truncate">{c.name}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">{cCount}</span>
                    </button>
                    {/* Cat to'g'ridan SKU'lari uchun bulk (subkati yo'q leaf) */}
                    {renderBulk && c.direct.length > 0 && renderBulk(c.id, c.direct.length)}
                  </div>
                  {cOpen && c.direct.map(SkuRow)}
                  {cOpen && c.subs.map((s) => {
                    const sOpen = searching || !closedS.has(s.id);
                    return (
                      <Fragment key={`s${s.id}`}>
                        <div className="flex items-center gap-2 px-3 py-1 pl-9 hover:bg-muted/20">
                          <button type="button" onClick={() => toggleS(s.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium text-muted-foreground">
                            <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", sOpen && "rotate-90")} />
                            <span className="truncate">{s.name}</span>
                            <span className="text-[10px]">{s.items.length}</span>
                          </button>
                          {renderBulk && renderBulk(s.id, s.items.length)}
                        </div>
                        {sOpen && s.items.map(SkuRow)}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

// SKU segment tahrir tugmalari (P / M / E — bosilsa biriktiradi, aktivni qayta bossa bo'shatadi)
function SegmentButtons({ value, onPick, disabled }: { value: Segment | null; onPick: (s: Segment | null) => void; disabled?: boolean }) {
  return (
    <span className="flex shrink-0 gap-0.5">
      {SEGMENTS.map((s) => {
        const on = value === s.v;
        return (
          <button key={s.v} type="button" disabled={disabled}
            onClick={() => onPick(on ? null : s.v)}
            title={s.label}
            className={cn(
              "h-6 w-6 rounded text-[11px] font-bold transition-colors disabled:opacity-50",
              on ? s.active : "text-muted-foreground/40 hover:bg-muted"
            )}>
            {s.short}
          </button>
        );
      })}
    </span>
  );
}

function SegmentBadge({ value }: { value: Segment | null }) {
  const s = value ? SEG_BY.get(value) : null;
  if (!s) return <span className="shrink-0 text-[10px] text-muted-foreground/40">—</span>;
  return <span className={cn("shrink-0 rounded border px-1.5 py-px text-[10px] font-bold", s.badge)}>{s.label}</span>;
}

// ─── Tab 1: Biriktirish (ta'minotchi kesimida iyerarxik) ──────────────────────
export function BiriktirishTab({ canEdit }: { canEdit: boolean }) {
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<PmeSku[]>([]);
  const [seg, setSeg] = useState<Map<number, Segment | null>>(new Map());
  const [q, setQ] = useState("");
  const [loadingSup, startSup] = useTransition();
  const [loadingItems, startItems] = useTransition();
  const [, startSave] = useTransition();

  useEffect(() => {
    startSup(async () => {
      const res = await pmeSuppliersAction();
      if (res.ok) setSuppliers(res.suppliers); else toast.error(res.error);
    });
  }, []);

  const supplierLabels = useMemo(() => {
    const o: Record<string, React.ReactNode> = {};
    for (const s of suppliers) o[String(s.id)] = s.name;
    return o;
  }, [suppliers]);

  const onSupplier = (v: string) => {
    setSupplierId(v);
    setItems([]); setSeg(new Map()); setQ("");
    if (!v) return;
    startItems(async () => {
      const res = await pmeSupplierSkusAction(Number(v));
      if (res.ok) {
        setItems(res.items);
        setSeg(new Map(res.items.map((it) => [it.productId, it.segment])));
      } else toast.error(res.error);
    });
  };

  const pick = (pid: number, s: Segment | null) => {
    setSeg((prev) => { const n = new Map(prev); n.set(pid, s); return n; });
    startSave(async () => {
      const res = await setSkuSegmentAction({ productId: pid, segment: s });
      if (!res.ok) toast.error(res.error);
    });
  };

  const bulk = (leafCatId: number, s: Segment | null) => {
    if (!supplierId) return;
    startSave(async () => {
      const res = await bulkSetSegmentAction({ supplierId: Number(supplierId), categoryId: leafCatId, segment: s });
      if (res.ok) {
        setSeg((prev) => {
          const n = new Map(prev);
          for (const it of items) if (leafCat(it) === leafCatId) n.set(it.productId, s);
          return n;
        });
        toast.success(`${res.count} ta SKU ${s ? SEG_BY.get(s)!.label : "bo'shatildi"}.`);
      } else toast.error(res.error);
    });
  };

  const Q = q.trim().toUpperCase();
  const searching = Q.length > 0;
  const shown = useMemo(
    () => (Q ? items.filter((i) => i.name.toUpperCase().includes(Q) || String(i.code).includes(Q)) : items),
    [items, Q]
  );

  // Segment sanoqlari
  const counts = useMemo(() => {
    const c = { PREMIUM: 0, MEDIUM: 0, EASY: 0, none: 0 };
    for (const it of items) { const v = seg.get(it.productId); if (v) c[v]++; else c.none++; }
    return c;
  }, [items, seg]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Yetkazib beruvchi</Label>
          <Select value={supplierId} onValueChange={(v) => onSupplier(typeof v === "string" ? v : "")} disabled={loadingSup} items={supplierLabels}>
            <SelectTrigger className="h-9 w-72 text-sm">
              <SelectValue placeholder={loadingSup ? "Yuklanmoqda…" : "Yetkazib beruvchi tanlang…"} />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name} · {s.skuCount} SKU</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {items.length > 0 && (
          <div className="relative min-w-56 flex-1">
            <Label className="text-xs text-muted-foreground">Qidirish</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU nomi yoki kodi..." className="h-9 pl-8 pr-8" />
              {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {SEGMENTS.map((s) => (
            <span key={s.v} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} /> {s.label}: <b className="tabular-nums">{counts[s.v]}</b>
            </span>
          ))}
          <span className="text-muted-foreground">Segmentsiz: <b className="tabular-nums">{counts.none}</b></span>
          {canEdit && <span className="text-muted-foreground">· P/M/E tugmasini bosing (aktivni qayta bossangiz — bo'shaydi). Subkat sarlavhasida — butun subkatga.</span>}
        </div>
      )}

      {loadingItems ? (
        <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> SKU'lar yuklanmoqda…</p>
      ) : !supplierId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Boshlash uchun yetkazib beruvchi tanlang.</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Bu yerda sizning qamrovingizda SKU yo&apos;q.</p>
      ) : (
        <SkuTree
          items={shown}
          searching={searching}
          renderRight={(it) =>
            canEdit
              ? <SegmentButtons value={seg.get(it.productId) ?? null} onPick={(s) => pick(it.productId, s)} />
              : <SegmentBadge value={seg.get(it.productId) ?? null} />
          }
          renderBulk={canEdit ? (leafCatId) => (
            <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              {SEGMENTS.map((s) => (
                <button key={s.v} type="button" onClick={() => bulk(leafCatId, s.v)} title={`Hammasini: ${s.label}`}
                  className={cn("h-5 w-5 rounded text-[10px] font-bold text-muted-foreground/50 transition-colors", s.bulkHover)}>
                  {s.short}
                </button>
              ))}
              <button type="button" onClick={() => bulk(leafCatId, null)} title="Hammasini bo'shatish"
                className="text-muted-foreground/40 transition-colors hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
            </span>
          ) : undefined}
        />
      )}
    </div>
  );
}

// ─── Tab 2: Analyze (segment → iyerarxiya) ────────────────────────────────────
export function AnalyzeTab() {
  const [items, setItems] = useState<PmeSku[]>([]);
  const [q, setQ] = useState("");
  const [loading, startLoad] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    startLoad(async () => {
      const res = await pmeAnalyzeAction();
      if (res.ok) setItems(res.items); else toast.error(res.error);
      setLoaded(true);
    });
  }, []);

  const Q = q.trim().toUpperCase();
  const searching = Q.length > 0;
  const shown = useMemo(
    () => (Q ? items.filter((i) => i.name.toUpperCase().includes(Q) || String(i.code).includes(Q) || (i.supplierName ?? "").toUpperCase().includes(Q)) : items),
    [items, Q]
  );
  const bySegment = useMemo(() => {
    const m = new Map<Segment, PmeSku[]>();
    for (const it of shown) if (it.segment) { const a = m.get(it.segment) ?? []; a.push(it); m.set(it.segment, a); }
    return m;
  }, [shown]);

  if (loading && !loaded) {
    return <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda…</p>;
  }
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Hali birorta SKU segmentga biriktirilmagan. &quot;Biriktirish&quot; tabidan boshlang.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU / kod / yetkazib beruvchi..." className="h-9 pl-8 pr-8" />
        {q && <button onClick={() => setQ("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>

      {SEGMENTS.map((s) => {
        const segItems = bySegment.get(s.v) ?? [];
        return (
          <div key={s.v} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={cn("h-3 w-3 rounded-full", s.dot)} />
              <h3 className="text-base font-bold">{s.label}</h3>
              <span className={cn("rounded border px-1.5 py-px text-[11px] font-bold", s.badge)}>{segItems.length} SKU</span>
            </div>
            {segItems.length === 0 ? (
              <p className="pl-5 text-xs italic text-muted-foreground">Bu segmentda SKU yo&apos;q.</p>
            ) : (
              <SkuTree
                items={segItems}
                searching={searching}
                renderRight={(it) => it.supplierName ? <span className="shrink-0 truncate text-[11px] text-muted-foreground" title={it.supplierName}>{it.supplierName}</span> : null}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
