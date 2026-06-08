"use client";

import { useState, useRef, useMemo, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ChevronRight, Loader2, Check, AlertCircle, TrendingUp, Percent,
  Search, ChevronsDownUp, ChevronsUpDown, Wallet, ListChecks, X,
  Sparkles, RefreshCw, Clock, Bot,
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
import { upsertSalesPlan, upsertMarginPlan, generateForecastAction } from "./actions";
import type { ForecastStatus } from "@/lib/forecast";

// ─── Tiplar ──────────────────────────────────────────────────────────────────
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
  forecastStatus: ForecastStatus;
}

// ─── Konstantalar ────────────────────────────────────────────────────────────
const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const CUR_YEAR = new Date().getFullYear();
const YEARS = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];

// ─── Yordamchi ───────────────────────────────────────────────────────────────
// Sotuv: butun so'm — faqat raqamli string saqlanadi, ko'rsatishda guruhlanadi.
function initSalesCells(vals: Record<number, number>): Record<number, Cell> {
  return Object.fromEntries(
    Object.entries(vals).map(([k, v]) => [
      Number(k),
      { val: String(Math.round(v)), st: "idle" as CellSt },
    ])
  );
}
// Marja: foiz (kasrli bo'lishi mumkin) — o'z holicha.
function initMarginCells(vals: Record<number, number>): Record<number, Cell> {
  return Object.fromEntries(
    Object.entries(vals).map(([k, v]) => [Number(k), { val: String(v), st: "idle" as CellSt }])
  );
}

const NF = new Intl.NumberFormat("uz-UZ");
function groupDigits(digits: string): string {
  if (!digits) return "";
  const n = parseInt(digits, 10);
  return isNaN(n) ? "" : NF.format(n);
}
function fmtMoney(n: number) {
  return NF.format(Math.round(n));
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
  forecastStatus,
}: PlanEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"sotuv" | "marja">(activeTab);
  const [salesCells, setSalesCells] = useState<Record<number, Cell>>(() =>
    initSalesCells(initSalesPlans)
  );
  const [marginCells, setMarginCells] = useState<Record<number, Cell>>(() =>
    initMarginCells(initMarginPlans)
  );
  const [query, setQuery] = useState("");

  // Faqat subkategoriyasi bor kategoriyalarni ko'rsatamiz (memo)
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

  const salesTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const marginTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // ─── Prognoz holati ────────────────────────────────────────────────────────
  const [fcStatus, setFcStatus] = useState<ForecastStatus>(forecastStatus);
  const [fcPending, startFc] = useTransition();
  const runForecast = () => {
    startFc(async () => {
      const res = await generateForecastAction({ branchId, year, month });
      if (res.ok) {
        toast.success("Prognoz yangilandi — dashboardda aks etadi.");
        setFcStatus({
          generated: true,
          lastGeneratedAt: new Date().toISOString(),
          groups: res.groups.map((g) => ({
            groupId: g.groupId,
            groupName: g.groupName,
            model: g.model,
            rationale: g.rationale,
            createdAt: new Date().toISOString(),
          })),
        });
        router.refresh();
      } else {
        toast.error(res.error || "Prognoz yaratishda xato.");
      }
    });
  };

  // ─── Select items xaritalari (label ko'rsatish uchun) ──────────────────────
  const branchItems = useMemo(
    () => Object.fromEntries(branches.map((b) => [String(b.id), b.name])),
    [branches]
  );
  const monthItems = useMemo(
    () => Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m])),
    []
  );
  const yearItems = useMemo(
    () => Object.fromEntries(YEARS.map((y) => [String(y), String(y)])),
    []
  );

  // ─── Navigatsiya (branchId / year / month) ─────────────────────────────────
  const navTo = (changes: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([k, v]) => p.set(k, v));
    router.push(`${pathname}?${p.toString()}`);
  };

  const switchTab = (t: "sotuv" | "marja") => {
    setTab(t);
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    window.history.replaceState(null, "", `${pathname}?${p.toString()}`);
  };

  // ─── Cell yangilash ────────────────────────────────────────────────────────
  const updCell = (
    setter: React.Dispatch<React.SetStateAction<Record<number, Cell>>>,
    id: number,
    patch: Partial<Cell>
  ) => {
    setter((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { val: "", st: "idle" as CellSt }), ...patch },
    }));
  };

  // ─── Sotuv saqlash ─────────────────────────────────────────────────────────
  const doSaveSales = async (id: number, digits: string) => {
    const amount = Math.max(0, parseInt(digits || "0", 10) || 0);
    updCell(setSalesCells, id, { st: "saving" });
    try {
      await upsertSalesPlan({ branchId, categoryId: id, year, month, amount });
      updCell(setSalesCells, id, { st: "saved" });
      setTimeout(() => updCell(setSalesCells, id, { st: "idle" }), 1800);
    } catch {
      updCell(setSalesCells, id, { st: "error" });
    }
  };
  const onSalesChange = (id: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    updCell(setSalesCells, id, { val: digits });
    clearTimeout(salesTimers.current[id]);
    salesTimers.current[id] = setTimeout(() => doSaveSales(id, digits), 650);
  };

  // ─── Marja saqlash ─────────────────────────────────────────────────────────
  const doSaveMargin = async (id: number, val: string) => {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    updCell(setMarginCells, id, { st: "saving" });
    try {
      await upsertMarginPlan({ branchId, categoryId: id, marginPct: pct });
      updCell(setMarginCells, id, { st: "saved" });
      setTimeout(() => updCell(setMarginCells, id, { st: "idle" }), 1800);
    } catch {
      updCell(setMarginCells, id, { st: "error" });
    }
  };
  const onMarginChange = (id: number, val: string) => {
    updCell(setMarginCells, id, { val });
    clearTimeout(marginTimers.current[id]);
    marginTimers.current[id] = setTimeout(() => doSaveMargin(id, val), 650);
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

  const allExpanded =
    expandedGroups.size === visibleGroups.length &&
    expandedCats.size === visibleGroups.flatMap((g) => g.cats).length;
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedGroups(new Set());
      setExpandedCats(new Set());
    } else {
      setExpandedGroups(new Set(visibleGroups.map((g) => g.id)));
      setExpandedCats(new Set(visibleGroups.flatMap((g) => g.cats.map((c) => c.id))));
    }
  };

  // ─── Qidiruv: subkat nomi bo'yicha ────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return visibleGroups;
    return visibleGroups
      .map((g) => ({
        ...g,
        cats: g.cats
          .map((c) => ({
            ...c,
            children: c.children.filter((s) => s.name.toLowerCase().includes(q)),
          }))
          .filter((c) => c.children.length > 0),
      }))
      .filter((g) => g.cats.length > 0);
  }, [visibleGroups, q]);

  // ─── Summary statistikalari (live) ─────────────────────────────────────────
  const stats = useMemo(() => {
    let salesTotal = 0, salesFilled = 0, marginSum = 0, marginFilled = 0;
    for (const s of allSubCats) {
      const sv = parseInt(salesCells[s.id]?.val || "0", 10) || 0;
      if (sv > 0) { salesTotal += sv; salesFilled++; }
      const mv = parseFloat(marginCells[s.id]?.val || "0") || 0;
      if (mv > 0) { marginSum += mv; marginFilled++; }
    }
    return {
      salesTotal,
      salesFilled,
      marginAvg: marginFilled ? marginSum / marginFilled : 0,
      marginFilled,
      total: allSubCats.length,
    };
  }, [allSubCats, salesCells, marginCells]);

  // ─── Guruh subtotal yordamchilari ──────────────────────────────────────────
  const groupSalesTotal = (g: Group) =>
    g.cats.reduce(
      (acc, c) =>
        acc + c.children.reduce((a, s) => a + (parseInt(salesCells[s.id]?.val || "0", 10) || 0), 0),
      0
    );
  const groupMarginAvg = (g: Group) => {
    let sum = 0, n = 0;
    for (const c of g.cats)
      for (const s of c.children) {
        const v = parseFloat(marginCells[s.id]?.val || "0") || 0;
        if (v > 0) { sum += v; n++; }
      }
    return n ? sum / n : 0;
  };

  // ─── Summary chiplar ───────────────────────────────────────────────────────
  const summaryRow = (tabType: "sotuv" | "marja") => (
    <div className="flex flex-wrap gap-2">
      {tabType === "sotuv" ? (
        <Chip icon={Wallet} label="Jami reja" value={`${fmtMoney(stats.salesTotal)} so'm`} tone="emerald" />
      ) : (
        <Chip icon={Percent} label="O'rtacha marja" value={`${stats.marginAvg.toFixed(1)}%`} tone="violet" />
      )}
      <Chip
        icon={ListChecks}
        label="To'ldirilgan"
        value={`${tabType === "sotuv" ? stats.salesFilled : stats.marginFilled} / ${stats.total}`}
        tone="slate"
      />
    </div>
  );

  // ─── Tree renderer ─────────────────────────────────────────────────────────
  const treeContent = (tabType: "sotuv" | "marja") => (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Sticky sarlavha */}
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_190px_32px] items-center bg-muted border-b border-border px-4 py-2.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Subkategoriya
        </span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
          {tabType === "sotuv" ? "Reja (so'm)" : "Marja %"}
        </span>
        <span />
      </div>

      <div className="max-h-[62vh] overflow-y-auto">
        {filteredGroups.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            <Search className="mx-auto mb-2 h-5 w-5 opacity-40" />
            «{query}» bo'yicha subkategoriya topilmadi
          </div>
        ) : (
          filteredGroups.map((group) => {
            const gExpanded = q ? true : expandedGroups.has(group.id);
            return (
              <div key={group.id}>
                {/* Guruh qatori */}
                <button
                  type="button"
                  onClick={() => !q && toggleGroup(group.id)}
                  className="w-full grid grid-cols-[1fr_190px_32px] items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/60 border-b border-border transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-muted-foreground/60 transition-transform duration-150 shrink-0",
                        gExpanded && "rotate-90"
                      )}
                    />
                    <span className="text-sm font-bold tracking-wide truncate">{group.name}</span>
                  </span>
                  <span className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
                    {tabType === "sotuv"
                      ? groupSalesTotal(group) > 0
                        ? fmtMoney(groupSalesTotal(group))
                        : ""
                      : groupMarginAvg(group) > 0
                      ? `Ø ${groupMarginAvg(group).toFixed(1)}%`
                      : ""}
                  </span>
                  <span />
                </button>

                {gExpanded &&
                  group.cats.map((cat) => {
                    const cExpanded = q ? true : expandedCats.has(cat.id);
                    return (
                      <div key={cat.id}>
                        {/* Kategoriya qatori */}
                        <button
                          type="button"
                          onClick={() => !q && toggleCat(cat.id)}
                          className="w-full flex items-center gap-2 pl-8 pr-4 py-2 hover:bg-muted/20 border-b border-border/60 transition-colors text-left"
                        >
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-150 shrink-0",
                              cExpanded && "rotate-90"
                            )}
                          />
                          <span className="text-sm font-semibold text-foreground/80 truncate">{cat.name}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground/50 shrink-0">
                            {cat.children.length} subkat
                          </span>
                        </button>

                        {cExpanded &&
                          cat.children.map((sub) => {
                            const cell =
                              tabType === "sotuv"
                                ? (salesCells[sub.id] ?? { val: "", st: "idle" as CellSt })
                                : (marginCells[sub.id] ?? { val: "", st: "idle" as CellSt });
                            const hasVal = cell.val !== "" && cell.val !== "0";

                            return (
                              <div
                                key={sub.id}
                                className="grid grid-cols-[1fr_190px_32px] items-center pl-14 pr-4 py-1.5 border-b border-border/30 hover:bg-muted/10"
                              >
                                <span
                                  className={cn(
                                    "text-sm truncate pr-4",
                                    hasVal ? "text-foreground/90" : "text-muted-foreground/70"
                                  )}
                                >
                                  {sub.name}
                                </span>

                                {isAdmin ? (
                                  tabType === "sotuv" ? (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={groupDigits(cell.val)}
                                      onChange={(e) => onSalesChange(sub.id, e.target.value)}
                                      placeholder="0"
                                      className={cn(
                                        "h-8 w-full rounded-md border bg-background px-2 text-right text-sm tabular-nums transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
                                        hasVal ? "border-input" : "border-input/60"
                                      )}
                                    />
                                  ) : (
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={cell.val}
                                        onChange={(e) => onMarginChange(sub.id, e.target.value)}
                                        placeholder="0"
                                        className={cn(
                                          "h-8 w-full rounded-md border bg-background pl-2 pr-6 text-right text-sm tabular-nums transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
                                          hasVal ? "border-input" : "border-input/60"
                                        )}
                                      />
                                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                        %
                                      </span>
                                    </div>
                                  )
                                ) : (
                                  <span className="text-right text-sm tabular-nums text-foreground/80">
                                    {hasVal
                                      ? tabType === "sotuv"
                                        ? fmtMoney(parseInt(cell.val, 10))
                                        : `${cell.val}%`
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
          })
        )}
      </div>
    </div>
  );

  // ─── Toolbar (qidiruv + yoyish/yig'ish) ────────────────────────────────────
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Subkategoriya qidirish..."
          className="h-9 pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Tozalash"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={toggleAll}
        disabled={!!q}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
      >
        {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
        {allExpanded ? "Yig'ish" : "Yoyish"}
      </button>
    </div>
  );

  // ─── AI prognoz paneli (faqat sotuv tab) ───────────────────────────────────
  const lastGen = fcStatus.lastGeneratedAt
    ? new Date(fcStatus.lastGeneratedAt).toLocaleString("uz-UZ", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const forecastPanel = (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <div className="text-sm font-semibold">AI kunlik prognoz</div>
            <p className="max-w-md text-xs text-muted-foreground leading-relaxed">
              Reja summasi tarixiy savdo shakliga ko'ra kunlarga taqsimlanadi. Yig'indi har doim
              kiritilgan rejaga teng. Dashboardda kunlik fakt vs prognoz aks etadi.
            </p>
            {lastGen && (
              <div className="flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" /> Oxirgi: {lastGen}
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={runForecast}
            disabled={fcPending}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-60"
          >
            {fcPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : fcStatus.generated ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {fcPending ? "Hisoblanmoqda..." : fcStatus.generated ? "Yangilash" : "Prognoz yaratish"}
          </button>
        )}
      </div>

      {fcStatus.groups.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {fcStatus.groups.map((g) => (
            <div key={g.groupId} className="rounded-lg border border-border/60 bg-card/60 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold truncate">{g.groupName}</span>
                <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">
                  <Bot className="h-2.5 w-2.5" />
                  {g.model === "fallback" ? "auto" : "AI"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-3">
                {g.rationale}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const body = (tabType: "sotuv" | "marja") => (
    <div className="space-y-3 pt-4">
      {summaryRow(tabType)}
      {tabType === "sotuv" && forecastPanel}
      {toolbar}
      {treeContent(tabType)}
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
            items={branchItems}
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
              <Select items={monthItems} value={String(month)} onValueChange={(v) => v && navTo({ month: v })}>
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
              <Select items={yearItems} value={String(year)} onValueChange={(v) => v && navTo({ year: v })}>
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
          <span className="self-end pb-1.5 text-xs italic text-muted-foreground">
            Ko'rish rejimi — faqat ADMIN tahrirlaydi
          </span>
        )}
      </div>

      {/* Tablar */}
      <Tabs value={tab} onValueChange={(v) => v && switchTab(v as "sotuv" | "marja")}>
        <TabsList className="h-9">
          <TabsTrigger value="sotuv" className="gap-1.5 px-4 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            Sotuv rejasi
          </TabsTrigger>
          <TabsTrigger value="marja" className="gap-1.5 px-4 text-xs">
            <Percent className="h-3.5 w-3.5" />
            Marja rejasi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sotuv">{body("sotuv")}</TabsContent>
        <TabsContent value="marja">{body("marja")}</TabsContent>
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
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: keyof typeof CHIP_TONES;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-1.5 ring-1", CHIP_TONES[tone])}>
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="text-xs font-medium opacity-80">{label}:</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}
