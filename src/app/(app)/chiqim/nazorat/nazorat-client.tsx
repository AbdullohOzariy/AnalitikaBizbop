"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
  Eraser,
  Target,
  TrendingDown,
  Wallet,
  Percent,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { StatCard, SectionCard } from "@/components/common/page";
import type { WriteoffControl, WoNode, WoStatus } from "@/lib/spisaniya/writeoff-plan";
import {
  upsertWriteoffPlanAction,
  setWriteoffTotalPlanAction,
  clearWriteoffPlansAction,
} from "./actions";

type CellSt = "idle" | "saving" | "saved" | "error";
type Cell = { val: string; st: CellSt };

const ST_TEXT: Record<WoStatus, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
  none: "text-muted-foreground",
};
const ST_BAR: Record<WoStatus, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  over: "bg-red-500",
  none: "bg-muted-foreground/25",
};
const ST_LABEL: Record<WoStatus, string> = {
  ok: "Reja doirasida",
  warn: "Rejadan bir oz oshgan",
  over: "Rejadan oshgan",
  none: "Reja qo'yilmagan",
};

function fmtPct(n: number | null | undefined, digits = 2): string {
  return n == null ? "—" : `${n.toFixed(digits)}%`;
}
/** Input uchun: ortiqcha nollarsiz ("1.25", "2", "" ) */
function pctToInput(n: number | null): string {
  return n == null ? "" : String(Number(n.toFixed(3)));
}

function StatusIcon({ st }: { st: CellSt }) {
  if (st === "saving") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/70" />;
  if (st === "saved") return <Check className="h-3 w-3 text-emerald-500" />;
  if (st === "error") return <AlertCircle className="h-3 w-3 text-destructive" />;
  return <span className="inline-block h-3 w-3" />;
}

/** Fakt/reja nisbatini bar sifatida (reja = 100%, oshsa to'liq to'ladi). */
function StatusBar({ node }: { node: WoNode }) {
  const ratio =
    node.planPct != null && node.planPct > 0 && node.factPct != null
      ? node.factPct / node.planPct
      : null;
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
      title={ratio != null ? `Rejaning ${(ratio * 100).toFixed(0)}%` : ST_LABEL[node.status]}
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full transition-all", ST_BAR[node.status])}
        style={{ width: `${Math.min((ratio ?? 0) * 100, 100)}%` }}
      />
    </div>
  );
}

/** Reja qamrovi 100% dan kam bo'lsa — ogohlantiruvchi badge. */
function CoverageBadge({ node }: { node: WoNode }) {
  if (node.planPct == null || node.coverage >= 0.995) return null;
  return (
    <span
      className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
      title={`Savdoning ${(node.coverage * 100).toFixed(0)}% qismiga reja qo'yilgan — qolganiga reja yo'q, shu sabab reja % pastroq ko'rinadi`}
    >
      {(node.coverage * 100).toFixed(0)}%
    </span>
  );
}

export function NazoratClient({
  data,
  branchId,
  branchLabel,
  isAdmin,
}: {
  data: WriteoffControl;
  branchId: number | null;
  branchLabel: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cells, setCells] = useState<Record<number, Cell>>({});
  const [totalCell, setTotalCell] = useState<Cell | null>(null);
  const [q, setQ] = useState("");
  const [onlyOver, setOnlyOver] = useState(false);

  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };

  // Qidiruv/filtr — subkat darajasida; ota qatorlar bolasi qolgan bo'lsa ko'rinadi.
  const needle = q.trim().toLowerCase();
  const keepSub = (s: { name: string; status: WoStatus }) =>
    (!needle || s.name.toLowerCase().includes(needle)) &&
    (!onlyOver || s.status === "over" || s.status === "warn");
  const filtering = Boolean(needle) || onlyOver;

  const groups = data.groups
    .map((g) => ({
      ...g,
      cats: g.cats
        .map((c) => ({ ...c, subcats: filtering ? c.subcats.filter(keepSub) : c.subcats }))
        .filter((c) => !filtering || c.subcats.length > 0),
    }))
    .filter((g) => !filtering || g.cats.length > 0);

  // Filtrlanganda hamma narsa ochiq ko'rinadi (qidiruv natijasi darhol ko'zga tashlansin)
  const isOpen = (key: string) => filtering || open.has(key);

  const expandAll = () => {
    const next = new Set<string>();
    for (const g of data.groups) {
      next.add(`g${g.id}`);
      for (const c of g.cats) next.add(`c${c.id}`);
    }
    setOpen(next);
  };

  const savePlan = (categoryId: number, raw: string) => {
    const trimmed = raw.trim();
    const num = Number(trimmed.replace(",", "."));
    if (trimmed === "" || !Number.isFinite(num) || num < 0 || num > 100) {
      setCells((p) => ({ ...p, [categoryId]: { val: raw, st: "error" } }));
      toast.error("Reja 0 dan 100 gacha foiz bo'lishi kerak");
      return;
    }
    setCells((p) => ({ ...p, [categoryId]: { val: raw, st: "saving" } }));
    startTransition(async () => {
      const res = await upsertWriteoffPlanAction({ branchId, categoryId, pct: num });
      if (res.ok) {
        setCells((p) => ({ ...p, [categoryId]: { val: raw, st: "saved" } }));
        router.refresh();
      } else {
        setCells((p) => ({ ...p, [categoryId]: { val: raw, st: "error" } }));
        toast.error(res.error);
      }
    });
  };

  const saveTotal = (raw: string) => {
    const trimmed = raw.trim();
    const num = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (num != null && (!Number.isFinite(num) || num < 0 || num > 100)) {
      setTotalCell({ val: raw, st: "error" });
      toast.error("Umumiy reja 0 dan 100 gacha foiz bo'lishi kerak");
      return;
    }
    setTotalCell({ val: raw, st: "saving" });
    startTransition(async () => {
      const res = await setWriteoffTotalPlanAction({ pct: num });
      if (res.ok) {
        setTotalCell({ val: raw, st: "saved" });
        router.refresh();
      } else {
        setTotalCell({ val: raw, st: "error" });
        toast.error(res.error);
      }
    });
  };

  const clearAll = () => {
    if (!confirm("Barcha filial × subkategoriya chiqim rejalari o'chiriladi. Davom etasizmi?")) return;
    startTransition(async () => {
      const res = await clearWriteoffPlansAction();
      if (res.ok) {
        setCells({});
        toast.success(`${res.count} ta reja o'chirildi`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const t = data.total;
  // Qo'lda qo'yilgan umumiy chegara bo'yicha ruxsat etilgan summa
  const totalAllowed = data.totalPlanPct != null ? (t.sales * data.totalPlanPct) / 100 : null;
  const totalDiff = totalAllowed != null ? t.writeoff - totalAllowed : null;

  return (
    <div className="space-y-5">
      {/* ── Umumiy ko'rsatkichlar ─────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Savdo"
          value={formatUZS(t.sales, { compact: true })}
          hint={branchLabel}
          icon={Wallet}
          tone="default"
        />
        <StatCard
          label="Chiqim"
          value={formatUZS(t.writeoff, { compact: true })}
          hint={
            data.unmappedWriteoff > 0
              ? `+ ${formatUZS(data.unmappedWriteoff, { compact: true })} bog'lanmagan`
              : "barcha turlar"
          }
          icon={TrendingDown}
          tone="red"
        />
        <StatCard
          label="Fakt ulush"
          value={<span className={ST_TEXT[data.totalStatus]}>{fmtPct(t.factPct)}</span>}
          hint="chiqim / savdo"
          icon={Percent}
          tone="default"
        />
        <StatCard
          label="Umumiy reja"
          value={fmtPct(data.totalPlanPct)}
          hint={
            totalDiff == null
              ? "chegara qo'yilmagan"
              : totalDiff > 0
                ? `${formatUZS(totalDiff, { compact: true })} oshgan`
                : `${formatUZS(-totalDiff, { compact: true })} zaxira`
          }
          icon={Target}
          tone={data.totalStatus === "over" ? "red" : data.totalStatus === "warn" ? "orange" : "green"}
        />
      </div>

      {/* ── Umumiy chegara: kiritish + rollup bilan solishtirish ──────── */}
      <SectionCard
        title="Umumiy reja (kompaniya bo'yicha)"
        description="Jami chiqim savdoning necha foizidan oshmasligi kerak"
      >
        <div className="flex flex-wrap items-end gap-4">
          {isAdmin ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Chegara, %</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-9 w-28 text-right tabular-nums"
                  placeholder="—"
                  value={totalCell?.val ?? pctToInput(data.totalPlanPct)}
                  onChange={(e) => setTotalCell({ val: e.target.value, st: "idle" })}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v.trim() === pctToInput(data.totalPlanPct)) return;
                    saveTotal(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <StatusIcon st={totalCell?.st ?? "idle"} />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Chegara</span>
              <div className="text-lg font-bold tabular-nums">{fmtPct(data.totalPlanPct)}</div>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Fakt</span>
            <div className={cn("text-lg font-bold tabular-nums", ST_TEXT[data.totalStatus])}>
              {fmtPct(t.factPct)}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Subkat rejalaridan yig'ilgan</span>
            <div className="flex items-center text-lg font-bold tabular-nums">
              {fmtPct(t.planPct)}
              <CoverageBadge node={t} />
            </div>
          </div>

          <div className="min-w-[200px] flex-1 space-y-1.5 pb-1">
            <span className="text-xs text-muted-foreground">{ST_LABEL[data.totalStatus]}</span>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full", ST_BAR[data.totalStatus])}
                style={{
                  width: `${Math.min(
                    data.totalPlanPct && data.totalPlanPct > 0 && t.factPct != null
                      ? (t.factPct / data.totalPlanPct) * 100
                      : 0,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Subkat rejalari umumiy chegaradan oshsa — rejalar o'zaro ziddiyatli */}
        {data.totalPlanPct != null && t.planPct != null && t.planPct > data.totalPlanPct && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Subkategoriya rejalaridan yig'ilgan ulush ({fmtPct(t.planPct)}) umumiy chegaradan
              ({fmtPct(data.totalPlanPct)}) yuqori — subkat rejalarini qayta ko'rib chiqing.
            </span>
          </div>
        )}
      </SectionCard>

      {/* ── Daraxt ────────────────────────────────────────────────────── */}
      <SectionCard
        title="Bo'lim → kategoriya → subkategoriya"
        description={
          isAdmin
            ? branchId
              ? "Reja % ustunini subkategoriya qatorida tahrirlang"
              : "Barcha filiallar rejimi — kiritilgan reja HAR BIR filialga yoziladi"
            : "Fakt ulushi reja bilan taqqoslanadi"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Subkategoriya qidirish"
                className="h-8 w-52 pl-8 text-xs"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Qidiruvni tozalash"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant={onlyOver ? "default" : "outline"}
              className="h-8 gap-1.5 text-xs"
              onClick={() => setOnlyOver((v) => !v)}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Rejadan oshganlar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => (open.size ? setOpen(new Set()) : expandAll())}
            >
              {open.size ? (
                <ChevronsDownUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5" />
              )}
              {open.size ? "Yopish" : "Ochish"}
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={clearAll}
                disabled={pending}
              >
                <Eraser className="h-3.5 w-3.5" />
                Rejalarni tozalash
              </Button>
            )}
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Nomi</th>
                <th className="px-3 py-2 text-right font-semibold">Savdo</th>
                <th className="px-3 py-2 text-right font-semibold">Chiqim</th>
                <th className="px-3 py-2 text-right font-semibold">Fakt %</th>
                <th className="px-3 py-2 text-right font-semibold">Reja %</th>
                <th className="px-3 py-2 text-right font-semibold">Farq</th>
                <th className="w-28 px-3 py-2 text-left font-semibold">Holat</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const gOpen = isOpen(`g${g.id}`);
                return (
                  <FragmentRows key={g.id}>
                    <Row
                      node={g}
                      depth={0}
                      expandable
                      expanded={gOpen}
                      onToggle={() => toggle(`g${g.id}`)}
                    />
                    {gOpen &&
                      g.cats.map((c) => {
                        const cOpen = isOpen(`c${c.id}`);
                        return (
                          <FragmentRows key={c.id}>
                            <Row
                              node={c}
                              depth={1}
                              expandable
                              expanded={cOpen}
                              onToggle={() => toggle(`c${c.id}`)}
                            />
                            {cOpen &&
                              c.subcats.map((s) => (
                                <Row
                                  key={s.id}
                                  node={s}
                                  depth={2}
                                  editable={isAdmin}
                                  cell={cells[s.id]}
                                  onDraft={(v) =>
                                    setCells((p) => ({ ...p, [s.id]: { val: v, st: "idle" } }))
                                  }
                                  onCommit={(v) => savePlan(s.id, v)}
                                />
                              ))}
                          </FragmentRows>
                        );
                      })}
                  </FragmentRows>
                );
              })}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Mos keladigan qator yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// <>...</> table ichida key bilan ishlatish uchun kichik yordamchi
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Row({
  node,
  depth,
  expandable,
  expanded,
  onToggle,
  editable,
  cell,
  onDraft,
  onCommit,
}: {
  node: WoNode;
  depth: 0 | 1 | 2;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  editable?: boolean;
  cell?: Cell;
  onDraft?: (v: string) => void;
  onCommit?: (v: string) => void;
}) {
  const serverVal = pctToInput(node.planPct);
  return (
    <tr
      className={cn(
        "border-b border-border/60 last:border-0",
        depth === 0 && "bg-muted/30 font-semibold",
        depth === 1 && "font-medium",
        depth === 2 && "hover:bg-muted/20"
      )}
    >
      <td className="px-3 py-2">
        <div
          className="flex items-center gap-1.5"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {expandable ? (
            <button
              onClick={onToggle}
              className="flex items-center gap-1.5 text-left hover:text-primary"
              aria-expanded={expanded}
            >
              <ChevronRight
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
              />
              <span className="truncate">{node.name}</span>
            </button>
          ) : (
            <span className="truncate pl-5">{node.name}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatUZS(node.sales, { compact: true })}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatUZS(node.writeoff, { compact: true })}
      </td>
      <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", ST_TEXT[node.status])}>
        {fmtPct(node.factPct)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {editable && onCommit ? (
          <div className="flex items-center justify-end gap-1.5">
            <Input
              type="text"
              inputMode="decimal"
              className="h-7 w-20 text-right text-xs tabular-nums"
              placeholder="—"
              value={cell?.val ?? serverVal}
              onChange={(e) => onDraft?.(e.target.value)}
              onBlur={(e) => {
                if (e.target.value.trim() === serverVal) return;
                onCommit(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <StatusIcon st={cell?.st ?? "idle"} />
          </div>
        ) : (
          <span className="flex items-center justify-end">
            {fmtPct(node.planPct)}
            <CoverageBadge node={node} />
          </span>
        )}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          node.diffAmount == null
            ? "text-muted-foreground"
            : node.diffAmount > 0
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {node.diffAmount == null
          ? "—"
          : `${node.diffAmount > 0 ? "+" : "−"}${formatUZS(Math.abs(node.diffAmount), { compact: true })}`}
      </td>
      <td className="px-3 py-2">
        <StatusBar node={node} />
      </td>
    </tr>
  );
}
