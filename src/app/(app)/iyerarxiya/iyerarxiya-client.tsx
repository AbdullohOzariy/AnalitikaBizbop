"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, ChevronRight, Eye, Pencil, FoldVertical, UnfoldVertical, X, Loader2, Package,
} from "lucide-react";
import { HierarchyEditor } from "./hierarchy-editor";
import { subProductsAction, type SubProduct } from "./actions";

export type HSub = { id: number; name: string; code: number | null; salesCount: number; skuCount: number };
export type HCat = {
  id: number;
  name: string;
  code: number | null;
  salesCount: number;
  children: HSub[];
};
export type HGroup = { id: number; name: string; code: number | null; categories: HCat[] };

const GROUP_COLORS: Record<string, { dot: string; badge: string }> = {
  FRESH: { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  FOOD: { dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  "NON-FOOD": { dot: "bg-blue-500", badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
};

const norm = (s: string) => s.toUpperCase();

/** 1C KOD badge — kodsiz bo'lsa amber ogohlantirish. */
function CodeBadge({ code }: { code: number | null }) {
  if (code == null)
    return (
      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono text-amber-600 dark:text-amber-400 border border-amber-500/20">
        kodsiz
      </span>
    );
  return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{code}</span>;
}

export function IyerarxiyaClient({
  groups,
  isAdmin,
}: {
  groups: HGroup[];
  isAdmin: boolean;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
  const [openCats, setOpenCats] = useState<Set<number>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<number>>(new Set());
  // Subkategoriya SKU'lari lazy yuklanadi (25k ni birdan emas)
  const [subData, setSubData] = useState<Map<number, { products: SubProduct[]; total: number } | "loading" | "error">>(new Map());
  const [, startLoad] = useTransition();

  const toggleSub = (sub: HSub) => {
    const willOpen = !openSubs.has(sub.id);
    setOpenSubs((p) => { const n = new Set(p); if (n.has(sub.id)) n.delete(sub.id); else n.add(sub.id); return n; });
    if (willOpen && !subData.has(sub.id) && sub.skuCount > 0) {
      setSubData((m) => new Map(m).set(sub.id, "loading"));
      startLoad(async () => {
        const res = await subProductsAction(sub.id);
        setSubData((m) => new Map(m).set(sub.id, res.ok ? { products: res.products, total: res.total } : "error"));
      });
    }
  };

  const q = query.trim();
  const searching = q.length > 0;

  // ── Statistika ──
  const stats = useMemo(() => {
    let cats = 0, subs = 0, noCode = 0, withSales = 0, sku = 0;
    for (const g of groups) {
      cats += g.categories.length;
      for (const c of g.categories) {
        if (c.code == null) noCode++;
        if (c.salesCount > 0) withSales++;
        subs += c.children.length;
        for (const s of c.children) {
          if (s.code == null) noCode++;
          if (s.salesCount > 0) withSales++;
          sku += s.skuCount;
        }
      }
    }
    return { groups: groups.length, cats, subs, noCode, withSales, sku };
  }, [groups]);

  // ── Qidiruv filtri ──
  const filtered = useMemo(() => {
    if (!searching) return groups;
    const Q = norm(q);
    const match = (name: string, code: number | null) =>
      norm(name).includes(Q) || (code != null && String(code).includes(Q));
    return groups
      .map((g) => {
        const gMatch = match(g.name, g.code);
        const cats = g.categories
          .map((c) => {
            const cMatch = match(c.name, c.code);
            const kids = gMatch || cMatch ? c.children : c.children.filter((s) => match(s.name, s.code));
            return cMatch || gMatch || kids.length > 0 ? { ...c, children: kids, _show: true } : null;
          })
          .filter(Boolean) as (HCat & { _show: boolean })[];
        return gMatch || cats.length > 0 ? { ...g, categories: cats } : null;
      })
      .filter(Boolean) as HGroup[];
  }, [groups, q, searching]);

  const isGroupOpen = (id: number) => searching || openGroups.has(id);
  const isCatOpen = (id: number) => searching || openCats.has(id);
  const toggleGroup = (id: number) =>
    setOpenGroups((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCat = (id: number) =>
    setOpenCats((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const expandAll = () => {
    setOpenGroups(new Set(groups.map((g) => g.id)));
    setOpenCats(new Set(groups.flatMap((g) => g.categories.map((c) => c.id))));
  };
  const collapseAll = () => { setOpenGroups(new Set()); setOpenCats(new Set()); };

  return (
    <div className="space-y-4">
      {/* ── Statistika paneli ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Guruh" value={stats.groups} />
        <StatCard label="Kategoriya" value={stats.cats} />
        <StatCard label="Subkategoriya" value={stats.subs} />
        <StatCard label="SKU (mahsulot)" value={stats.sku} />
        <StatCard label="Kodsiz" value={stats.noCode} warn={stats.noCode > 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {groups.map((g) => {
          const subs = g.categories.reduce((s, c) => s + c.children.length, 0);
          const col = GROUP_COLORS[g.name];
          return (
            <span key={g.id} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5">
              <span className={`h-1.5 w-1.5 rounded-full ${col?.dot ?? "bg-muted-foreground"}`} />
              {g.name}: {g.categories.length} kat / {subs} sub
            </span>
          );
        })}
      </div>

      {/* ── Boshqaruv qatori ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Qidirish — nom yoki 1C kod..."
            className="h-9 pl-8 pr-8"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Tozalash" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {mode === "view" && !searching && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-9" onClick={expandAll} title="Hammasini och">
              <UnfoldVertical className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={collapseAll} title="Hammasini yig'">
              <FoldVertical className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {isAdmin && (
          <div className="inline-flex rounded-lg border p-0.5">
            <Button size="sm" variant={mode === "view" ? "secondary" : "ghost"} className="h-8" onClick={() => setMode("view")}>
              <Eye className="h-3.5 w-3.5 mr-1" /> {"Ko'rish"}
            </Button>
            <Button size="sm" variant={mode === "edit" ? "secondary" : "ghost"} className="h-8" onClick={() => setMode("edit")}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Tahrirlash
            </Button>
          </div>
        )}
      </div>

      {/* ── Tana ── */}
      {mode === "edit" ? (
        <HierarchyEditor groups={groups} query={q} />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Hech narsa topilmadi.</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((group) => {
            const col = GROUP_COLORS[group.name] ?? { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground border-border" };
            const gOpen = isGroupOpen(group.id);
            return (
              <div key={group.id} className="rounded-xl border border-border bg-card">
                <button
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={gOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${gOpen ? "rotate-90" : ""}`} />
                  <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${col.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                    {group.name}
                  </span>
                  <CodeBadge code={group.code} />
                  <span className="text-xs text-muted-foreground">{group.categories.length} ta kategoriya</span>
                </button>

                {gOpen && (
                  <div className="border-t border-border/60 divide-y divide-border/40">
                    {group.categories.map((cat) => {
                      const cOpen = isCatOpen(cat.id);
                      return (
                        <div key={cat.id}>
                          <button
                            onClick={() => toggleCat(cat.id)}
                            aria-expanded={cOpen}
                            className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                          >
                            <ChevronRight className={`mt-0.5 ml-6 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${cOpen ? "rotate-90" : ""}`} />
                            <span className="flex flex-1 min-w-0 flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">{cat.name}</span>
                              <CodeBadge code={cat.code} />
                              <span className="text-xs text-muted-foreground">
                                {cat.children.length > 0 && `${cat.children.length} sub`}
                                {cat.salesCount > 0 && ` · ${cat.salesCount} sotuv`}
                              </span>
                            </span>
                          </button>

                          {cOpen && (
                            <div className="px-4 pb-3 pt-1 ml-14 space-y-1.5">
                              {cat.children.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Subkategoriya yo&apos;q</p>
                              ) : (
                                cat.children.map((sub) => {
                                  const sOpen = openSubs.has(sub.id);
                                  const d = subData.get(sub.id);
                                  return (
                                    <div key={sub.id} className="rounded-lg border border-border/50 bg-muted/30">
                                      <button
                                        onClick={() => toggleSub(sub)}
                                        aria-expanded={sOpen}
                                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
                                      >
                                        <ChevronRight className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${sOpen ? "rotate-90" : ""}`} />
                                        <span className="text-xs font-medium">{sub.name}</span>
                                        <CodeBadge code={sub.code} />
                                        {sub.salesCount > 0 && (
                                          <span className="text-[11px] text-muted-foreground">{sub.salesCount} sotuv</span>
                                        )}
                                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                          <Package className="h-3 w-3" /> {sub.skuCount}
                                        </span>
                                      </button>
                                      {sOpen && (
                                        <div className="border-t border-border/40 px-2.5 py-2">
                                          {sub.skuCount === 0 ? (
                                            <p className="text-[11px] text-muted-foreground italic">SKU yo&apos;q</p>
                                          ) : d === "error" ? (
                                            <p className="text-[11px] text-destructive">Yuklab bo&apos;lmadi.</p>
                                          ) : d === undefined || d === "loading" ? (
                                            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                              <Loader2 className="h-3 w-3 animate-spin" /> Yuklanmoqda…
                                            </p>
                                          ) : (
                                            <>
                                              <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                                {d.products.map((p) => (
                                                  <div key={p.code} className="flex items-center gap-1.5 text-[11px] min-w-0">
                                                    <span className="shrink-0 rounded bg-background px-1 font-mono text-[10px] text-muted-foreground">{p.code}</span>
                                                    <span className="truncate" title={p.name}>{p.name}</span>
                                                  </div>
                                                ))}
                                              </div>
                                              {d.total > d.products.length && (
                                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                                  Ko&apos;rsatilgan {d.products.length} / jami {d.total}
                                                </p>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card px-3 py-2 ${warn ? "border-amber-500/40" : "border-border"}`}>
      <div className={`text-xl font-bold ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
