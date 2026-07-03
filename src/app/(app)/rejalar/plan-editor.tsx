"use client";

import { Suspense, useState, useRef, useMemo, useTransition, useEffect, type ComponentProps } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ChevronRight, Loader2, Check, AlertCircle, TrendingUp, Percent,
  Search, ChevronsDownUp, ChevronsUpDown, Wallet, ListChecks, X,
  Sparkles, RefreshCw, Clock, CalendarRange, Lock, Unlock, Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  upsertSalesPlan,
  upsertMarginPlan,
  generateForecastAllAction,
  setForecastDayAction,
  clearSalesPlansAction,
  clearMarginPlansAction,
  clearForecastAction,
} from "./actions";
import type { ForecastMonthStatus, ForecastDayCell } from "@/lib/forecast";
import { nowTashkent } from "@/lib/date";

// ─── Tiplar ──────────────────────────────────────────────────────────────────
type CellSt = "idle" | "saving" | "saved" | "error";
type Cell = { val: string; st: CellSt };
type FCell = { val: string; locked: boolean; st: CellSt };
type Tab = "sotuv" | "marja" | "prognoz";

export type SubCat = { id: number; name: string };
export type Cat = { id: number; name: string; children: SubCat[] };
export type Group = { id: number; name: string; cats: Cat[] };
type Branch = { id: number; name: string };

export interface PlanEditorProps {
  branches: Branch[];
  groups: Group[];
  initSalesPlans: Record<number, Record<number, number>>;
  initMarginPlans: Record<number, Record<number, number>>;
  year: number;
  month: number;
  activeTab: Tab;
  isAdmin: boolean;
  forecastStatus: ForecastMonthStatus;
  initForecastDays: Record<number, Record<string, ForecastDayCell>>;
  branchPlanTotals: Record<number, number>;
}

// ─── Konstantalar ────────────────────────────────────────────────────────────
const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const WD_SHORT = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sha"];
// Toshkent (UTC+5) yili — lokal getFullYear() server/brauzer TZ farqida hydration xavfi.
const CUR_YEAR = nowTashkent().getUTCFullYear();
const YEARS = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];

// ─── Yordamchi ───────────────────────────────────────────────────────────────
const ck = (a: number, b: number) => `${a}_${b}`;
const fk = (br: number, date: string) => `${br}_${date}`;
const NF = new Intl.NumberFormat("uz-UZ");
function groupDigits(d: string): string {
  if (!d) return "";
  const n = parseInt(d, 10);
  return isNaN(n) ? "" : NF.format(n);
}
function fmtMoney(n: number) {
  return NF.format(Math.round(n));
}
function fmtCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " mlrd";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " mln";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " ming";
  return String(Math.round(n));
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function buildFcCells(map: Record<number, Record<string, ForecastDayCell>>): Record<string, FCell> {
  const o: Record<string, FCell> = {};
  for (const [br, byDate] of Object.entries(map))
    for (const [date, cell] of Object.entries(byDate))
      o[fk(Number(br), date)] = { val: String(Math.round(cell.amount)), locked: cell.locked, st: "idle" };
  return o;
}

function StatusIcon({ st }: { st: CellSt }) {
  if (st === "saving") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" />;
  if (st === "saved") return <Check className="h-3 w-3 text-emerald-500" />;
  if (st === "error") return <AlertCircle className="h-3 w-3 text-destructive" />;
  return <span className="inline-block h-3 w-3" />;
}

// ─── Asosiy komponent ─────────────────────────────────────────────────────────
function PlanEditorInner({
  branches,
  groups,
  initSalesPlans,
  initMarginPlans,
  year,
  month,
  activeTab,
  isAdmin,
  forecastStatus,
  initForecastDays,
  branchPlanTotals,
}: PlanEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(activeTab);

  // ─── Hujayralar (subkat × filial) ──────────────────────────────────────────
  const [salesCells, setSalesCells] = useState<Record<string, Cell>>(() => {
    const o: Record<string, Cell> = {};
    for (const [sub, byBr] of Object.entries(initSalesPlans))
      for (const [br, v] of Object.entries(byBr))
        o[ck(Number(sub), Number(br))] = { val: String(Math.round(v)), st: "idle" };
    return o;
  });
  const [marginCells, setMarginCells] = useState<Record<string, Cell>>(() => {
    const o: Record<string, Cell> = {};
    for (const [sub, byBr] of Object.entries(initMarginPlans))
      for (const [br, v] of Object.entries(byBr))
        o[ck(Number(sub), Number(br))] = { val: String(v), st: "idle" };
    return o;
  });
  const [fcCells, setFcCells] = useState<Record<string, FCell>>(() => buildFcCells(initForecastDays));

  const [query, setQuery] = useState("");

  // Faqat subkategoriyasi bor kategoriyalar
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, cats: g.cats.filter((c) => c.children.length > 0) }))
        .filter((g) => g.cats.length > 0),
    [groups]
  );
  const allSubCats = useMemo(
    () => visibleGroups.flatMap((g) => g.cats.flatMap((c) => c.children)),
    [visibleGroups]
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(
    () => new Set(visibleGroups.map((g) => g.id))
  );
  const [expandedCats, setExpandedCats] = useState<Set<number>>(
    () => new Set(visibleGroups.flatMap((g) => g.cats.map((c) => c.id)))
  );

  const salesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const marginTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fcTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Unmount (oy/tab almashganda) — kutilayotgan debounce timerlarni tozalaymiz
  // (eskirgan qiymat DB'ga yozilmasligi uchun).
  useEffect(() => {
    const all = [salesTimers, marginTimers, fcTimers];
    return () => { for (const t of all) Object.values(t.current).forEach(clearTimeout); };
  }, []);

  // ─── Prognoz holati ────────────────────────────────────────────────────────
  const [fcStatus, setFcStatus] = useState<ForecastMonthStatus>(forecastStatus);
  const [fcPending, startFc] = useTransition();
  const runForecastAll = () => {
    startFc(async () => {
      const res = await generateForecastAllAction({ year, month });
      if (res.ok) {
        const ai = res.groups.filter((g) => g.model !== "fallback").length;
        toast.success(`Prognoz yangilandi — ${res.branchCount} filial (AI: ${ai}, auto: ${res.groups.length - ai}).`);
        setFcStatus({ lastGeneratedAt: new Date().toISOString(), branchIds: branches.map((b) => b.id) });
        setFcCells(buildFcCells(res.days));
      } else {
        toast.error(res.error || "Prognoz yaratishda xato.");
      }
    });
  };

  // ─── Tozalash (tanlangan, ko'rinib turgan davr) ────────────────────────────
  const [clearing, startClear] = useTransition();
  const clearSales = () => {
    if (!confirm(`${MONTHS[month - 1]} ${year} — barcha sotuv rejasi (barcha filial) o'chirilsinmi?`)) return;
    startClear(async () => {
      const res = await clearSalesPlansAction({ year, month });
      if (res.ok) { toast.success(`${res.count} ta yozuv tozalandi.`); setSalesCells({}); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const clearMargin = () => {
    if (!confirm("BARCHA filial va subkategoriya marja rejasi o'chiriladi (marja vaqtsiz — oy bo'yicha emas). Davom etilsinmi?")) return;
    startClear(async () => {
      const res = await clearMarginPlansAction();
      if (res.ok) { toast.success(`${res.count} ta yozuv tozalandi.`); setMarginCells({}); router.refresh(); }
      else toast.error(res.error);
    });
  };
  const clearForecast = () => {
    if (!confirm(`${MONTHS[month - 1]} ${year} — prognoz o'chirilsinmi?`)) return;
    startClear(async () => {
      const res = await clearForecastAction({ year, month });
      if (res.ok) {
        toast.success("Prognoz tozalandi.");
        setFcCells({});
        setFcStatus({ lastGeneratedAt: null, branchIds: [] });
        router.refresh();
      } else toast.error(res.error);
    });
  };

  // ─── Select items ──────────────────────────────────────────────────────────
  const monthItems = useMemo(() => Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m])), []);
  const yearItems = useMemo(() => Object.fromEntries(YEARS.map((y) => [String(y), String(y)])), []);

  const navTo = (changes: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([k, v]) => p.set(k, v));
    router.push(`${pathname}?${p.toString()}`);
  };
  const switchTab = (t: Tab) => {
    setTab(t);
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    window.history.replaceState(null, "", `${pathname}?${p.toString()}`);
  };

  // ─── Hujayra yangilash ─────────────────────────────────────────────────────
  function patch<T extends { st: CellSt }>(
    setter: React.Dispatch<React.SetStateAction<Record<string, T>>>,
    key: string,
    upd: Partial<NoInfer<T>>,
    fallback: NoInfer<T>
  ) {
    setter((prev) => ({ ...prev, [key]: { ...(prev[key] ?? fallback), ...upd } }));
  }

  // Sotuv
  const onSalesChange = (sub: number, br: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const key = ck(sub, br);
    patch(setSalesCells, key, { val: digits }, { val: "", st: "idle" });
    clearTimeout(salesTimers.current[key]);
    salesTimers.current[key] = setTimeout(async () => {
      patch(setSalesCells, key, { st: "saving" }, { val: digits, st: "idle" });
      try {
        await upsertSalesPlan({ branchId: br, categoryId: sub, year, month, amount: parseInt(digits || "0", 10) || 0 });
        patch(setSalesCells, key, { st: "saved" }, { val: digits, st: "idle" });
        setTimeout(() => patch(setSalesCells, key, { st: "idle" }, { val: digits, st: "idle" }), 1500);
      } catch {
        patch(setSalesCells, key, { st: "error" }, { val: digits, st: "idle" });
      }
    }, 650);
  };

  // Marja
  const onMarginChange = (sub: number, br: number, raw: string) => {
    const key = ck(sub, br);
    patch(setMarginCells, key, { val: raw }, { val: "", st: "idle" });
    clearTimeout(marginTimers.current[key]);
    marginTimers.current[key] = setTimeout(async () => {
      const pct = Math.min(100, Math.max(0, parseFloat(raw) || 0));
      patch(setMarginCells, key, { st: "saving" }, { val: raw, st: "idle" });
      try {
        await upsertMarginPlan({ branchId: br, categoryId: sub, marginPct: pct });
        patch(setMarginCells, key, { st: "saved" }, { val: raw, st: "idle" });
        setTimeout(() => patch(setMarginCells, key, { st: "idle" }, { val: raw, st: "idle" }), 1500);
      } catch {
        patch(setMarginCells, key, { st: "error" }, { val: raw, st: "idle" });
      }
    }, 650);
  };

  // Kunlik prognoz — tahrir (qulflanadi + qolganlar qayta taqsimlanadi)
  const applyDays = (br: number, days: Record<string, ForecastDayCell>) => {
    setFcCells((prev) => {
      const next = { ...prev };
      for (const [date, c] of Object.entries(days))
        next[fk(br, date)] = { val: String(Math.round(c.amount)), locked: c.locked, st: "idle" };
      return next;
    });
  };
  const onFcChange = (br: number, date: string, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const key = fk(br, date);
    patch(setFcCells, key, { val: digits, locked: true }, { val: "", locked: false, st: "idle" });
    clearTimeout(fcTimers.current[key]);
    fcTimers.current[key] = setTimeout(async () => {
      patch(setFcCells, key, { st: "saving" }, { val: digits, locked: true, st: "idle" });
      const res = await setForecastDayAction({ branchId: br, year, month, date, amount: parseInt(digits || "0", 10) || 0 });
      if (res.ok) applyDays(br, res.days);
      else { patch(setFcCells, key, { st: "error" }, { val: digits, locked: true, st: "idle" }); toast.error(res.error); }
    }, 650);
  };
  const unlockFc = async (br: number, date: string) => {
    const key = fk(br, date);
    patch(setFcCells, key, { st: "saving" }, { val: "", locked: false, st: "idle" });
    const res = await setForecastDayAction({ branchId: br, year, month, date, amount: null });
    if (res.ok) applyDays(br, res.days);
    else { patch(setFcCells, key, { st: "error" }, { val: "", locked: true, st: "idle" }); toast.error(res.error); }
  };

  // ─── Tree toggle ───────────────────────────────────────────────────────────
  const toggleGroup = (id: number) =>
    setExpandedGroups((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const toggleCat = (id: number) =>
    setExpandedCats((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const allExpanded =
    expandedGroups.size === visibleGroups.length &&
    expandedCats.size === visibleGroups.flatMap((g) => g.cats).length;
  const toggleAll = () => {
    if (allExpanded) { setExpandedGroups(new Set()); setExpandedCats(new Set()); }
    else {
      setExpandedGroups(new Set(visibleGroups.map((g) => g.id)));
      setExpandedCats(new Set(visibleGroups.flatMap((g) => g.cats.map((c) => c.id))));
    }
  };

  // ─── Qidiruv ───────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return visibleGroups;
    return visibleGroups
      .map((g) => ({
        ...g,
        cats: g.cats
          .map((c) => ({ ...c, children: c.children.filter((s) => s.name.toLowerCase().includes(q)) }))
          .filter((c) => c.children.length > 0),
      }))
      .filter((g) => g.cats.length > 0);
  }, [visibleGroups, q]);

  // ─── Grid o'lchamlari ──────────────────────────────────────────────────────
  const N = branches.length;
  const planGridStyle = { gridTemplateColumns: `minmax(220px, 1.4fr) repeat(${N}, minmax(150px, 1fr))` };
  const planMinWidth = 220 + N * 160;

  // ─── Summary (joriy tab) ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    let sTotal = 0, sFill = 0, mSum = 0, mFill = 0;
    for (const s of allSubCats)
      for (const b of branches) {
        const sv = parseInt(salesCells[ck(s.id, b.id)]?.val || "0", 10) || 0;
        if (sv > 0) { sTotal += sv; sFill++; }
        const mv = parseFloat(marginCells[ck(s.id, b.id)]?.val || "0") || 0;
        if (mv > 0) { mSum += mv; mFill++; }
      }
    const total = allSubCats.length * N;
    return { sTotal, sFill, mAvg: mFill ? mSum / mFill : 0, mFill, total };
  }, [allSubCats, branches, salesCells, marginCells, N]);

  // Bo'lim subtotal (filial bo'yicha)
  const groupBranchTotal = (g: Group, br: number, type: "sotuv" | "marja") => {
    if (type === "sotuv")
      return g.cats.reduce((a, c) => a + c.children.reduce((x, s) => x + (parseInt(salesCells[ck(s.id, br)]?.val || "0", 10) || 0), 0), 0);
    let sum = 0, n = 0;
    for (const c of g.cats) for (const s of c.children) {
      const v = parseFloat(marginCells[ck(s.id, br)]?.val || "0") || 0;
      if (v > 0) { sum += v; n++; }
    }
    return n ? sum / n : 0;
  };

  // ─── Sotuv/Marja daraxti (ko'p filial ustun) ───────────────────────────────
  const planTree = (type: "sotuv" | "marja") => {
    const cells = type === "sotuv" ? salesCells : marginCells;
    const onChange = type === "sotuv" ? onSalesChange : onMarginChange;
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <div style={{ minWidth: planMinWidth }}>
          <div className="max-h-[62vh] overflow-y-auto">
            {/* Sticky sarlavha */}
            <div className="sticky top-0 z-10 grid items-end gap-px bg-muted border-b border-border" style={planGridStyle}>
              <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Subkategoriya
              </div>
              {branches.map((b) => (
                <div key={b.id} className="px-2 py-1.5 text-right">
                  <div className="text-xs font-semibold truncate">{b.name}</div>
                  <div className="text-[10px] text-muted-foreground">{type === "sotuv" ? "Reja (so'm)" : "Marja %"}</div>
                </div>
              ))}
            </div>

            {filteredGroups.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                <Search className="mx-auto mb-2 h-5 w-5 opacity-40" />«{query}» topilmadi
              </div>
            ) : (
              filteredGroups.map((group) => {
                const gExpanded = q ? true : expandedGroups.has(group.id);
                return (
                  <div key={group.id}>
                    {/* Guruh qatori + filial subtotallari */}
                    <button
                      type="button"
                      onClick={() => !q && toggleGroup(group.id)}
                      className="grid w-full items-center gap-px bg-muted/40 hover:bg-muted/60 border-b border-border text-left transition-colors"
                      style={planGridStyle}
                    >
                      <span className="flex items-center gap-2 px-4 py-2.5 min-w-0">
                        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform", gExpanded && "rotate-90")} />
                        <span className="truncate text-sm font-bold tracking-wide">{group.name}</span>
                      </span>
                      {branches.map((b) => {
                        const v = groupBranchTotal(group, b.id, type);
                        return (
                          <span key={b.id} className="px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                            {type === "sotuv" ? (v > 0 ? fmtCompact(v) : "") : v > 0 ? `Ø${v.toFixed(1)}%` : ""}
                          </span>
                        );
                      })}
                    </button>

                    {gExpanded &&
                      group.cats.map((cat) => {
                        const cExpanded = q ? true : expandedCats.has(cat.id);
                        return (
                          <div key={cat.id}>
                            {/* Kategoriya qatori — to'liq kenglik sarlavha */}
                            <button
                              type="button"
                              onClick={() => !q && toggleCat(cat.id)}
                              className="flex w-full items-center gap-2 border-b border-border/60 py-2 pl-8 pr-4 text-left transition-colors hover:bg-muted/20"
                            >
                              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform", cExpanded && "rotate-90")} />
                              <span className="truncate text-sm font-semibold text-foreground/80">{cat.name}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/50">{cat.children.length} subkat</span>
                            </button>

                            {cExpanded &&
                              cat.children.map((sub) => (
                                <div key={sub.id} className="grid items-center gap-px border-b border-border/30 hover:bg-muted/10" style={planGridStyle}>
                                  <span className="truncate py-1.5 pl-14 pr-3 text-sm text-foreground/90">{sub.name}</span>
                                  {branches.map((b) => {
                                    const cell = cells[ck(sub.id, b.id)] ?? { val: "", st: "idle" as CellSt };
                                    const hasVal = cell.val !== "" && cell.val !== "0";
                                    return (
                                      <div key={b.id} className="flex items-center gap-1 px-2 py-1">
                                        {isAdmin ? (
                                          type === "sotuv" ? (
                                            <input
                                              type="text" inputMode="numeric"
                                              aria-label={`${sub.name} — ${b.name} reja (so'm)`}
                                              value={groupDigits(cell.val)}
                                              onChange={(e) => onChange(sub.id, b.id, e.target.value)}
                                              placeholder="0"
                                              className={cn("h-8 w-full rounded-md border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring", hasVal ? "border-input" : "border-input/60")}
                                            />
                                          ) : (
                                            <div className="relative w-full">
                                              <input
                                                type="number" min="0" max="100" step="0.01"
                                                aria-label={`${sub.name} — ${b.name} marja %`}
                                                value={cell.val}
                                                onChange={(e) => onChange(sub.id, b.id, e.target.value)}
                                                placeholder="0"
                                                className={cn("h-8 w-full rounded-md border bg-background pl-2 pr-5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring", hasVal ? "border-input" : "border-input/60")}
                                              />
                                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                                            </div>
                                          )
                                        ) : (
                                          <span className="w-full text-right text-sm tabular-nums text-foreground/80">
                                            {hasVal ? (type === "sotuv" ? fmtMoney(parseInt(cell.val, 10)) : `${cell.val}%`) : "—"}
                                          </span>
                                        )}
                                        <StatusIcon st={cell.st} />
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Toolbar ───────────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Subkategoriya qidirish..." className="h-9 pl-8 pr-8" />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Tozalash">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button type="button" onClick={toggleAll} disabled={!!q}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
        {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
        {allExpanded ? "Yig'ish" : "Yoyish"}
      </button>
    </div>
  );

  const clearBtn = (onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      disabled={clearing}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eraser className="h-3 w-3" />}
      {label}
    </button>
  );

  const summaryRow = (type: "sotuv" | "marja") => (
    <div className="flex flex-wrap items-center gap-2">
      {type === "sotuv" ? (
        <Chip icon={Wallet} label="Jami reja (barcha filial)" value={`${fmtMoney(stats.sTotal)} so'm`} tone="emerald" />
      ) : (
        <Chip icon={Percent} label="O'rtacha marja" value={`${stats.mAvg.toFixed(1)}%`} tone="violet" />
      )}
      <Chip icon={ListChecks} label="To'ldirilgan" value={`${type === "sotuv" ? stats.sFill : stats.mFill} / ${stats.total}`} tone="slate" />
      {isAdmin && (
        <div className="ml-auto">
          {type === "sotuv"
            ? clearBtn(clearSales, `${MONTHS[month - 1]} tozalash`)
            : clearBtn(clearMargin, "Marjani tozalash")}
        </div>
      )}
    </div>
  );

  // ─── Kunlik prognoz tab ────────────────────────────────────────────────────
  const lastGen = fcStatus.lastGeneratedAt
    ? new Date(fcStatus.lastGeneratedAt).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const nDays = daysInMonth(year, month);
  const fcGridStyle = { gridTemplateColumns: `96px repeat(${N}, minmax(140px, 1fr))` };
  const fcMinWidth = 96 + N * 150;

  const branchFcTotal = (br: number) => {
    let s = 0;
    for (let d = 1; d <= nDays; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      s += parseInt(fcCells[fk(br, date)]?.val || "0", 10) || 0;
    }
    return s;
  };
  const hasAnyForecast = Object.keys(fcCells).length > 0;

  const prognozBody = (
    <div className="space-y-3 pt-4">
      {/* Generatsiya paneli */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold">AI kunlik prognoz — {MONTHS[month - 1]} {year}</div>
              <p className="max-w-lg text-xs leading-relaxed text-muted-foreground">
                Reja summasi tarixiy savdo shakliga ko'ra kunlarga taqsimlanadi. Quyida qiymatni qo'lda
                o'zgartirsangiz — o'sha kun <b>qulflanadi</b>, qolgan kunlar avtomatik qayta taqsimlanadi
                (oy yig'indisi rejaga teng qoladi). Dashboardda fakt vs prognoz aks etadi.
              </p>
              {lastGen && <div className="flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> Oxirgi: {lastGen}</div>}
            </div>
          </div>
          {isAdmin && (
            <div className="flex shrink-0 items-center gap-2">
              {hasAnyForecast && clearBtn(clearForecast, "Tozalash")}
              <button type="button" onClick={runForecastAll} disabled={fcPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-60">
                {fcPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasAnyForecast ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {fcPending ? "Hisoblanmoqda..." : hasAnyForecast ? "Qayta yaratish" : "Prognoz yaratish"}
              </button>
            </div>
          )}
        </div>
      </div>

      {!hasAnyForecast ? (
        <div className="rounded-xl border border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <CalendarRange className="mx-auto mb-2 h-6 w-6 opacity-40" />
          Bu oy uchun prognoz hali yaratilmagan. Avval Sotuv rejasini kiriting, so'ng «Prognoz yaratish».
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <div style={{ minWidth: fcMinWidth }}>
            <div className="max-h-[62vh] overflow-y-auto">
              {/* Sticky sarlavha: filiallar */}
              <div className="sticky top-0 z-10 grid items-end gap-px bg-muted border-b border-border" style={fcGridStyle}>
                <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kun</div>
                {branches.map((b) => (
                  <div key={b.id} className="px-2 py-2 text-right text-xs font-semibold truncate">{b.name}</div>
                ))}
              </div>

              {/* Kunlar */}
              {Array.from({ length: nDays }, (_, i) => i + 1).map((d) => {
                const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const wd = new Date(date + "T00:00:00.000Z").getUTCDay();
                const weekend = wd === 0 || wd === 6;
                return (
                  <div key={d} className={cn("grid items-center gap-px border-b border-border/30", weekend ? "bg-amber-500/[0.04]" : "hover:bg-muted/10")} style={fcGridStyle}>
                    <span className="px-3 py-1 text-xs tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground/80">{d}</span> {WD_SHORT[wd]}
                    </span>
                    {branches.map((b) => {
                      const cell = fcCells[fk(b.id, date)] ?? { val: "", locked: false, st: "idle" as CellSt };
                      return (
                        <div key={b.id} className="flex items-center gap-1 px-2 py-1">
                          {isAdmin ? (
                            <input
                              type="text" inputMode="numeric"
                              aria-label={`${d}-kun — ${b.name} prognoz (so'm)`}
                              value={groupDigits(cell.val)}
                              onChange={(e) => onFcChange(b.id, date, e.target.value)}
                              placeholder="0"
                              className={cn("h-7 w-full rounded-md border bg-background px-2 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring", cell.locked ? "border-violet-400/70 bg-violet-500/[0.04]" : "border-input/60")}
                            />
                          ) : (
                            <span className="w-full text-right text-xs tabular-nums text-foreground/80">{cell.val ? fmtMoney(parseInt(cell.val, 10)) : "—"}</span>
                          )}
                          {isAdmin && cell.locked ? (
                            <button type="button" onClick={() => unlockFc(b.id, date)} title="Qulfni ochish (auto)" className="text-violet-500 hover:text-violet-700">
                              {cell.st === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                            </button>
                          ) : cell.st === "saving" ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" />
                          ) : (
                            <span className="inline-block h-3 w-3 text-muted-foreground/20"><Unlock className="h-3 w-3" /></span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Footer: jami vs reja */}
              <div className="sticky bottom-0 grid items-center gap-px border-t-2 border-border bg-muted" style={fcGridStyle}>
                <span className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jami / Reja</span>
                {branches.map((b) => {
                  const tot = branchFcTotal(b.id);
                  const plan = branchPlanTotals[b.id] ?? 0;
                  const ok = Math.abs(tot - plan) <= 1;
                  return (
                    <span key={b.id} className="px-2 py-1.5 text-right text-[11px] tabular-nums">
                      <span className={cn("font-bold", ok ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{fmtCompact(tot)}</span>
                      <span className="text-muted-foreground"> / {fmtCompact(plan)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Filtr: Oy/Yil (sotuv & prognoz) */}
      {(tab === "sotuv" || tab === "prognoz") && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Oy</Label>
            <Select items={monthItems} value={String(month)} onValueChange={(v) => v && navTo({ month: v })}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Yil</Label>
            <Select items={yearItems} value={String(year)} onValueChange={(v) => v && navTo({ year: v })}>
              <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!isAdmin && <span className="self-end pb-1.5 text-xs italic text-muted-foreground">Ko'rish rejimi — faqat System Admin tahrirlaydi</span>}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => v && switchTab(v as Tab)}>
        <TabsList className="h-9">
          <TabsTrigger value="sotuv" className="gap-1.5 px-4 text-xs"><TrendingUp className="h-3.5 w-3.5" />Sotuv rejasi</TabsTrigger>
          <TabsTrigger value="marja" className="gap-1.5 px-4 text-xs"><Percent className="h-3.5 w-3.5" />Marja rejasi</TabsTrigger>
          <TabsTrigger value="prognoz" className="gap-1.5 px-4 text-xs"><CalendarRange className="h-3.5 w-3.5" />Kunlik prognoz</TabsTrigger>
        </TabsList>

        <TabsContent value="sotuv">
          <div className="space-y-3 pt-4">{summaryRow("sotuv")}{toolbar}{planTree("sotuv")}</div>
        </TabsContent>
        <TabsContent value="marja">
          <div className="space-y-3 pt-4">{summaryRow("marja")}{toolbar}{planTree("marja")}</div>
        </TabsContent>
        <TabsContent value="prognoz">{prognozBody}</TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Summary chip ──────────────────────────────────────────────────────────────
const CHIP_TONES = {
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-500/20",
  slate: "bg-muted text-muted-foreground ring-border",
} as const;

function Chip({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; tone: keyof typeof CHIP_TONES;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1", CHIP_TONES[tone])}>
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="text-xs font-medium opacity-80">{label}:</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

// useSearchParams Suspense chegarasini talab qiladi (statik prerender'da xato) —
// wrapper barcha ishlatish joylarini qamraydi.
export function PlanEditor(props: ComponentProps<typeof PlanEditorInner>) {
  return (
    <Suspense fallback={null}>
      <PlanEditorInner {...props} />
    </Suspense>
  );
}
