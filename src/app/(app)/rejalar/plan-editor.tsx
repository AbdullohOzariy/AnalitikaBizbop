"use client";

import { useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Loader2, Check, AlertCircle, TrendingUp, Percent } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { upsertSalesPlan, upsertMarginPlan } from "./actions";

// ─── Tiplар ──────────────────────────────────────────────────────────────────
type CellSt = "idle" | "saving" | "saved" | "error";
type Cell = { val: string; st: CellSt };

export type SubCat = { id: number; name: string };
export type Cat = { id: number; name: string; children: SubCat[] };
export type Group = { id: number; name: string; cats: Cat[] };

export interface PlanEditorProps {
  branches: { id: number; name: string }[];
  groups: Group[];
  initSalesPlans: Record<number, number>;
  initMarginPlans: Record<number, number>;
  branchId: number;
  year: number;
  month: number;
  activeTab: "sotuv" | "marja";
  isAdmin: boolean;
}

// ─── Yordamchi ───────────────────────────────────────────────────────────────
const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const CUR_YEAR = new Date().getFullYear();
const YEARS = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];

function initCells(vals: Record<number, number>): Record<number, Cell> {
  return Object.fromEntries(
    Object.entries(vals).map(([k, v]) => [Number(k), { val: String(v), st: "idle" as CellSt }])
  );
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

function StatusIcon({ st }: { st: CellSt }) {
  if (st === "saving") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />;
  if (st === "saved") return <Check className="h-3.5 w-3.5 text-emerald-500" />;
  if (st === "error") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return null;
}

// ─── Asosiy komponent ─────────────────────────────────────────────────────────
export function PlanEditor({
  branches,
  groups,
  initSalesPlans,
  initMarginPlans,
  branchId,
  year,
  month,
  activeTab,
  isAdmin,
}: PlanEditorProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"sotuv" | "marja">(activeTab);
  const [salesCells, setSalesCells] = useState<Record<number, Cell>>(() =>
    initCells(initSalesPlans)
  );
  const [marginCells, setMarginCells] = useState<Record<number, Cell>>(() =>
    initCells(initMarginPlans)
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(
    () => new Set(groups.map((g) => g.id))
  );
  const [expandedCats, setExpandedCats] = useState<Set<number>>(
    () => new Set(groups.flatMap((g) => g.cats.map((c) => c.id)))
  );

  const salesTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const marginTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // ─── URL navigatsiya (branchId / year / month o'zgarganda) ─────────────────
  const navTo = (changes: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([k, v]) => p.set(k, v));
    window.location.href = `${pathname}?${p.toString()}`;
  };

  // Tab o'zgarishi — URL'ni history.replaceState bilan yangilaymiz (server refetch yo'q)
  const switchTab = (t: "sotuv" | "marja") => {
    setTab(t);
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    window.history.replaceState(null, "", `${pathname}?${p.toString()}`);
  };

  // ─── Cell yangilash yordamchisi ─────────────────────────────────────────────
  const updCell = (
    setter: React.Dispatch<React.SetStateAction<Record<number, Cell>>>,
    id: number,
    patch: Partial<Cell>
  ) => {
    setter((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { val: "0", st: "idle" as CellSt }), ...patch },
    }));
  };

  // ─── Sales save ────────────────────────────────────────────────────────────
  const doSaveSales = async (id: number, val: string) => {
    const amount = Math.max(0, parseFloat(val) || 0);
    updCell(setSalesCells, id, { st: "saving" });
    try {
      await upsertSalesPlan({ branchId, categoryId: id, year, month, amount });
      updCell(setSalesCells, id, { st: "saved" });
      setTimeout(() => updCell(setSalesCells, id, { st: "idle" }), 2000);
    } catch {
      updCell(setSalesCells, id, { st: "error" });
    }
  };

  const onSalesChange = (id: number, val: string) => {
    updCell(setSalesCells, id, { val });
    clearTimeout(salesTimers.current[id]);
    salesTimers.current[id] = setTimeout(() => doSaveSales(id, val), 700);
  };

  // ─── Margin save ───────────────────────────────────────────────────────────
  const doSaveMargin = async (id: number, val: string) => {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    updCell(setMarginCells, id, { st: "saving" });
    try {
      await upsertMarginPlan({ branchId, categoryId: id, marginPct: pct });
      updCell(setMarginCells, id, { st: "saved" });
      setTimeout(() => updCell(setMarginCells, id, { st: "idle" }), 2000);
    } catch {
      updCell(setMarginCells, id, { st: "error" });
    }
  };

  const onMarginChange = (id: number, val: string) => {
    updCell(setMarginCells, id, { val });
    clearTimeout(marginTimers.current[id]);
    marginTimers.current[id] = setTimeout(() => doSaveMargin(id, val), 700);
  };

  // ─── Tree toggle ───────────────────────────────────────────────────────────
  const toggleGroup = (id: number) =>
    setExpandedGroups((prev) => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });

  const toggleCat = (id: number) =>
    setExpandedCats((prev) => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });

  // ─── Tree renderer ─────────────────────────────────────────────────────────
  const treeContent = (tabType: "sotuv" | "marja") => (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Jadval sarlavhasi */}
      <div className="grid grid-cols-[1fr_180px_36px] items-center bg-muted/50 border-b border-border px-4 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Subkategoriya
        </span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
          {tabType === "sotuv" ? "Reja (so'm)" : "Marja %"}
        </span>
        <span />
      </div>

      {groups.map((group) => {
        // Faqat subkategoriyasi bor kategoriyalarni ko'rsatamiz
        const visibleCats = group.cats.filter((c) => c.children.length > 0);
        if (visibleCats.length === 0) return null;

        const gExpanded = expandedGroups.has(group.id);
        return (
          <div key={group.id}>
            {/* Guruh qatori */}
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 border-b border-border transition-colors text-left"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground/60 transition-transform duration-150 shrink-0",
                  gExpanded && "rotate-90"
                )}
              />
              <span className="text-sm font-bold tracking-wide">{group.name}</span>
            </button>

            {gExpanded &&
              visibleCats.map((cat) => {
                const cExpanded = expandedCats.has(cat.id);
                return (
                  <div key={cat.id}>
                    {/* Kategoriya qatori */}
                    <button
                      type="button"
                      onClick={() => toggleCat(cat.id)}
                      className="w-full flex items-center gap-2 pl-8 pr-4 py-2 hover:bg-muted/20 border-b border-border/60 transition-colors text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-150 shrink-0",
                          cExpanded && "rotate-90"
                        )}
                      />
                      <span className="text-sm font-semibold text-foreground/80">{cat.name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground/50">
                        {cat.children.length} subkat
                      </span>
                    </button>

                    {cExpanded &&
                      cat.children.map((sub) => {
                        const cell =
                          tabType === "sotuv"
                            ? (salesCells[sub.id] ?? { val: "", st: "idle" as CellSt })
                            : (marginCells[sub.id] ?? { val: "", st: "idle" as CellSt });

                        return (
                          <div
                            key={sub.id}
                            className="grid grid-cols-[1fr_180px_36px] items-center pl-14 pr-4 py-1.5 border-b border-border/30 hover:bg-muted/10"
                          >
                            <span className="text-sm text-foreground/90 truncate pr-4">
                              {sub.name}
                            </span>

                            {isAdmin ? (
                              <input
                                type="number"
                                min="0"
                                step={tabType === "sotuv" ? "10000" : "0.01"}
                                max={tabType === "marja" ? "100" : undefined}
                                value={cell.val}
                                onChange={(e) =>
                                  tabType === "sotuv"
                                    ? onSalesChange(sub.id, e.target.value)
                                    : onMarginChange(sub.id, e.target.value)
                                }
                                placeholder="0"
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            ) : (
                              <span className="text-right text-sm tabular-nums text-foreground/80">
                                {tabType === "sotuv"
                                  ? cell.val
                                    ? fmtMoney(parseFloat(cell.val))
                                    : "—"
                                  : cell.val
                                  ? `${cell.val}%`
                                  : "—"}
                              </span>
                            )}

                            <div className="flex justify-center">
                              <StatusIcon st={cell.st} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Filtr paneli */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Filial</Label>
          <Select
            value={String(branchId)}
            onValueChange={(v) => v && navTo({ branchId: v })}
          >
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tab === "sotuv" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Oy</Label>
              <Select
                value={String(month)}
                onValueChange={(v) => v && navTo({ month: v })}
              >
                <SelectTrigger className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Yil</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => v && navTo({ year: v })}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {!isAdmin && (
          <span className="text-xs text-muted-foreground italic self-end pb-1.5">
            Ko'rish rejimi — faqat ADMIN tahrirlaydi
          </span>
        )}
      </div>

      {/* Tablar */}
      <Tabs
        value={tab}
        onValueChange={(v) => v && switchTab(v as "sotuv" | "marja")}
      >
        <TabsList className="h-9">
          <TabsTrigger value="sotuv" className="gap-1.5 text-xs px-4">
            <TrendingUp className="h-3.5 w-3.5" />
            Sotuv rejasi
          </TabsTrigger>
          <TabsTrigger value="marja" className="gap-1.5 text-xs px-4">
            <Percent className="h-3.5 w-3.5" />
            Marja rejasi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sotuv" className="pt-4">
          {treeContent("sotuv")}
        </TabsContent>
        <TabsContent value="marja" className="pt-4">
          {treeContent("marja")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
