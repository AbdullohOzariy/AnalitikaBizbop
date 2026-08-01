"use client";

import { useMemo, useState, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
} from "recharts";
import { Info, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { formatNumber, formatUZS } from "@/lib/format";
import { marjaTone, MARJA_YAXSHI, MARJA_QONIQARLI, type MarjaTone } from "@/lib/marja";
import { cn } from "@/lib/utils";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { DailySalesChart } from "@/components/charts";
import type {
  MarjaRow,
  MarjaGroupNode,
  KpiByBranchRow,
  GroupSalesDayRow,
  GroupPlanDayRow,
  PlanGroupNode,
  PlanBranchCell,
} from "@/lib/analytics-v2";

// CSS tokenlariga asoslangan tooltip — dark mode'da ham to'g'ri
const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--card)",
  backdropFilter: "blur(12px)",
  borderRadius: "12px",
  border: "1px solid var(--border)",
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.12)",
  fontSize: "13px",
  color: "var(--foreground)",
};

// Grafik o'qi uchun CSS token yordamchi qiymati
// (recharts SVG elementlari CSS variables qo'llab-quvvatlamaydi,
//  shuning uchun bir joyda saqlangan o'zgaruvchi orqali boshqaramiz)
const CHART_TICK_FILL = "var(--muted-foreground)";

export function TrendIndicator({ value }: { value?: number | null }) {
  if (value == null) return null;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const color = isPositive ? "text-emerald-500" : isNegative ? "text-red-500" : "text-muted-foreground";
  const absValue = Math.abs(value);
  const formatted = absValue % 1 === 0 ? absValue.toString() : absValue.toFixed(1);
  const text = isPositive ? `${formatted}% oshdi` : isNegative ? `${formatted}% tushdi` : "O'zgarmadi";

  return (
    <div className={`flex items-center gap-1 text-[11px] font-medium mt-1.5 ${color}`} title="O'tgan davrga nisbatan">
      <Icon className="h-3.5 w-3.5" />
      <span>{text}</span>
    </div>
  );
}

function CompareBadge({ value }: { value?: number | null }) {
  if (value == null) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        O'tgan period: baza yo'q
      </span>
    );
  }
  const isPositive = value > 0;
  const isNegative = value < 0;
  const color = isPositive
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : isNegative
    ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : "bg-muted text-muted-foreground";
  const text = isPositive ? "o'sish" : isNegative ? "pasayish" : "o'zgarishsiz";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      O'tgan periodga nisbatan {Math.abs(value).toFixed(1)}% {text}
    </span>
  );
}

function WidgetTitle({ title, trend }: { title: React.ReactNode; trend?: number | null }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{title}</span>
      <CompareBadge value={trend} />
    </span>
  );
}

// ============ Marja breakdown ============

function MarjaInfoTooltip() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
  };

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Marja formulasi"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {pos && (
        <div
          className="fixed z-[200] w-64 rounded-xl border border-border bg-popover shadow-xl p-3 text-xs pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold text-foreground mb-1">Marja hisoblash formulasi</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            (Sotuv − Tannarx) ÷ Sotuv × 100
          </p>
          <div className="mt-2 pt-2 border-t border-border/60 space-y-0.5 text-[11px] text-muted-foreground">
            {/* Chegaralar src/lib/marja.ts dan — afsona va bo'yoq bir manbadan */}
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#81b29a] inline-block" />≥ {MARJA_YAXSHI}%
              </span>
              <span>Yaxshi</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#f2c94c] inline-block" />{MARJA_QONIQARLI}–{MARJA_YAXSHI}%
              </span>
              <span>O&apos;rtacha</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#e07a5f] inline-block" />&lt; {MARJA_QONIQARLI}%
              </span>
              <span>Past</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Semantik tone → shu vidjetning Recharts palitrasi (boshqa ekranlarda boshqacha). */
const MARJA_RANG: Record<MarjaTone, string> = {
  good: "#81b29a",
  ok: "#f2c94c",
  bad: "#e07a5f",
  none: "#f1f5f9",
};

function MarjaBaseWidget({ title, rows }: { title: React.ReactNode; rows: MarjaRow[] }) {
  const sortedData = [...rows]
    .sort((a, b) => (b.marja ?? -100) - (a.marja ?? -100))
    // `tone` shu yerda hisoblanadi: tannarx yo'q bo'lsa marja "0" emas, NULL —
    // aks holda ma'lumot yetishmasligi "past marja" deb bo'yalardi.
    .map((r) => ({ name: r.name, marja: r.marja ?? 0, tone: marjaTone(r.cost > 0 ? r.marja : null) }));

  if (sortedData.length === 0) {
    return (
      <ExpandableCard title={title} className="rounded-2xl border-border/50">
        <p className="text-xs text-muted-foreground italic text-center py-6">Ma'lumot yo'q</p>
      </ExpandableCard>
    );
  }

  return (
    <ExpandableCard title={title} className="rounded-2xl border-border/50">
      <div className="pt-2">
        <ResponsiveContainer width="100%" height={Math.max(160, sortedData.length * 36)}>
          <BarChart data={sortedData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barSize={10}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: CHART_TICK_FILL }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: 'transparent' }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, "Marja"]}
            />
            <Bar dataKey="marja" radius={4}>
              {sortedData.map((d) => (
                <Cell
                  key={d.name}
                  fill={MARJA_RANG[d.tone]}
                />
              ))}
              <LabelList
                dataKey="marja"
                position="right"
                formatter={(v) => (typeof v === "number" || typeof v === "string" ? `${Number(v).toFixed(1)}%` : "")}
                style={{ fontSize: 11, fill: CHART_TICK_FILL, fontWeight: 500 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ExpandableCard>
  );
}

export function MarjaByBranchWidget({ data }: { data: MarjaRow[] }) {
  return (
    <MarjaBaseWidget
      title={
        <div className="flex items-center gap-2">
          <span>Marja: Filiallar</span>
          <MarjaInfoTooltip />
        </div>
      }
      rows={data}
    />
  );
}

// ============ Marja iyerarxiyasi: Guruh → Kategoriya (default yig'iq) ============

function marjaColor(m: number | null): string {
  if (m == null) return "text-muted-foreground";
  return m >= 30 ? "text-emerald-600 dark:text-emerald-400" : m >= 15 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
}
function marjaBar(m: number | null): string {
  if (m == null) return "bg-muted";
  return m >= 30 ? "bg-emerald-500" : m >= 15 ? "bg-amber-500" : "bg-red-500";
}
function MarjaMiniBar({ marja, small }: { marja: number | null; small?: boolean }) {
  const pct = marja == null ? 0 : Math.max(0, Math.min(100, (marja / 50) * 100)); // 50% = to'la
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-full bg-muted", small ? "h-1.5 w-14" : "h-2 w-24")}>
      <div className={cn("h-full rounded-full", marjaBar(marja))} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MarjaHierarchyWidget({ data }: { data: MarjaGroupNode[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <ExpandableCard
      title={
        <div className="flex items-center gap-2">
          <span>Marja: Guruhlar</span>
          <MarjaInfoTooltip />
        </div>
      }
      className="rounded-2xl border-border/50"
    >
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs italic text-muted-foreground">Ma&apos;lumot yo&apos;q</p>
      ) : (
        <div className="space-y-0.5 pt-1">
          {data.map((g) => {
            const isOpen = open.has(g.id);
            return (
              <div key={g.id}>
                <button
                  onClick={() => toggle(g.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <span className="flex-1 truncate text-sm font-semibold">{g.name}</span>
                  <MarjaMiniBar marja={g.marja} />
                  <span className={cn("w-14 text-right text-sm font-bold tabular-nums", marjaColor(g.marja))}>
                    {g.marja != null ? `${g.marja.toFixed(1)}%` : "—"}
                  </span>
                </button>
                {isOpen && (
                  <div className="mb-1 ml-[19px] space-y-0.5 border-l border-border/50 pl-4">
                    {g.categories.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 py-1">
                        <span className="flex-1 truncate text-xs text-muted-foreground">{c.name}</span>
                        <MarjaMiniBar marja={c.marja} small />
                        <span className={cn("w-12 text-right text-xs tabular-nums", marjaColor(c.marja))}>
                          {c.marja != null ? `${c.marja.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ExpandableCard>
  );
}

// ============ Reja bajarilishi: bo'lim → kategoriya → subkategoriya ============

/** Reja bajarilishi ohangi — Top kategoriyalar/KPI bilan bir xil chegaralar. */
function planColor(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  return pct >= 100
    ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 90
    ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";
}
function planBar(pct: number | null): string {
  if (pct == null) return "bg-muted-foreground/30";
  return pct >= 100 ? "bg-emerald-500" : pct >= 90 ? "bg-amber-500" : "bg-red-500";
}
function PlanMiniBar({ pct, small }: { pct: number | null; small?: boolean }) {
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct)); // 100% = to'la
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-full bg-muted", small ? "h-1.5 w-14" : "h-2 w-24")}>
      <div className={cn("h-full rounded-full", planBar(pct))} style={{ width: `${w}%` }} />
    </div>
  );
}
function PlanPct({ pct, small }: { pct: number | null; small?: boolean }) {
  return (
    <span
      className={cn(
        "text-right tabular-nums",
        small ? "w-12 text-xs" : "w-14 text-sm font-bold",
        planColor(pct)
      )}
      title="Reja bajarilishi: fakt ÷ reja"
    >
      {pct != null ? `${pct.toFixed(0)}%` : "—"}
    </span>
  );
}

// ── Chiqim (spisaniya) reja holati — writeoff-plan.ts statuslari bilan bir xil ──
// Polyarlik teskari: chiqim reja ICHIDA bo'lsa yaxshi (yashil), oshsa — qizil.
export type WoBranchCell = {
  branchId: number;
  factPct: number | null;
  planPct: number | null;
  status: "ok" | "warn" | "over" | "none";
};

export type WoCell = {
  /** "g" — bo'lim, "c" — kategoriya, "s" — subkategoriya (id'lar darajalararo kesishmasin) */
  level: "g" | "c" | "s";
  id: number;
  factPct: number | null;
  planPct: number | null;
  status: "ok" | "warn" | "over" | "none";
  /** Filial kesimi — faqat "barcha filiallar" ko'rinishida to'ldiriladi. */
  byBranch?: WoBranchCell[];
};

const WO_TONE: Record<WoCell["status"], string> = {
  ok:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-400/15 text-amber-700 dark:text-amber-400",
  over: "bg-red-500/10 text-red-600 dark:text-red-400",
  none: "bg-muted text-muted-foreground",
};
const WO_HINT: Record<WoCell["status"], string> = {
  ok:   "reja ichida",
  warn: "rejadan biroz oshgan",
  over: "rejadan oshgan",
  none: "reja qo'yilmagan",
};

function WoBadge({ wo, small }: { wo?: WoCell; small?: boolean }) {
  const w = small ? "w-[86px]" : "w-[96px]";
  if (!wo || wo.factPct == null) {
    return <span className={cn("shrink-0 text-right text-[11px] text-muted-foreground/60", w)}>—</span>;
  }
  const fact = wo.factPct.toFixed(1);
  const plan = wo.planPct != null ? wo.planPct.toFixed(1) : null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-center font-semibold tabular-nums",
        small ? "text-[10px]" : "text-[11px]",
        w,
        WO_TONE[wo.status]
      )}
      title={`Chiqim: fakt ${fact}%${plan ? ` / reja ${plan}%` : ""} — ${WO_HINT[wo.status]}`}
    >
      {plan ? `${fact}/${plan}%` : `${fact}%`}
    </span>
  );
}

/**
 * Iyerarxiya bilan bir xil daraxt (bo'lim → kategoriya → subkategoriya), har
 * darajada SAVDO reja bajarilishi % va CHIQIM (spisaniya) reja holati.
 * Summalar ko'rsatilmaydi. Kesish/limit yo'q — Iyerarxiyadagi barcha kategoriyalar
 * ro'yxatda bo'ladi.
 */
/**
 * Filial ustuni — faqat "barcha filiallar" tanlanganda. Rangi umumiy % bilan AYNI
 * shkalada (100+ yashil, 90+ sariq, past qizil), lekin shrifti mayda: bu yordamchi
 * kesim, asosiy raqam o'ngdagi jami.
 */
/** Chiqim matni: reja bo'lsa "fakt/reja", bo'lmasa faqat fakt. */
function woMatn(w?: WoBranchCell): string | null {
  if (!w || w.factPct == null) return null;
  const f = w.factPct.toFixed(1);
  return w.planPct != null ? `${f}/${w.planPct.toFixed(1)}` : f;
}

/** Chiqim ohangi — WO_TONE bilan bir xil mantiq, lekin faqat matn rangi. */
const WO_TEXT: Record<WoBranchCell["status"], string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
  none: "text-muted-foreground/50",
};

function BranchPct({
  cell,
  wo,
  small,
}: {
  cell?: PlanBranchCell;
  wo?: WoBranchCell;
  small?: boolean;
}) {
  const pct = cell?.planPct ?? null;
  const woTxt = woMatn(wo);
  return (
    <span
      className={cn("shrink-0 text-right tabular-nums", small ? "w-[62px]" : "w-[68px]")}
      title={
        [
          cell && cell.plan > 0
            ? `Savdo: fakt ${formatUZS(cell.fact)} ÷ reja ${formatUZS(cell.plan)}`
            : "Savdo rejasi qo'yilmagan",
          wo && wo.factPct != null
            ? `Chiqim: fakt ${wo.factPct.toFixed(1)}%${wo.planPct != null ? ` / reja ${wo.planPct.toFixed(1)}%` : ""} — ${WO_HINT[wo.status]}`
            : "Chiqim: ma'lumot yo'q",
        ].join("\n")
      }
    >
      <span className={cn("block", small ? "text-[10px]" : "text-[11px] font-medium", planColor(pct))}>
        {pct != null ? `${pct.toFixed(0)}%` : "—"}
      </span>
      {/* Chiqim savdo foizining OSTIDA — alohida ustun qilinsa jadval ikki barobar
          kengayardi va nom ustuni siqilib ketardi. */}
      <span className={cn("block text-[9px] leading-tight", woTxt ? WO_TEXT[wo!.status] : "text-muted-foreground/30")}>
        {woTxt ?? "—"}
      </span>
    </span>
  );
}

export function PlanHierarchyWidget({
  data,
  branches,
  writeoff,
  writeoffLimitPct,
}: {
  data: PlanGroupNode[];
  /** Filial ustunlari (bo'sh — bitta filial tanlangan, kesim ko'rsatilmaydi). */
  branches?: { id: number; name: string }[];
  /** Chiqim nazorati (writeoff-plan.ts) — daraja+id bo'yicha biriktiriladi */
  writeoff?: WoCell[];
  /** Kompaniya bo'yicha qo'lda qo'yilgan chiqim chegarasi (AppSetting) — kontekst uchun */
  writeoffLimitPct?: number | null;
}) {
  const fb = branches ?? [];
  /** Tugundagi filial kataklarini `branches` tartibida qaytaradi. */
  const bc = (n: { byBranch?: PlanBranchCell[] }) =>
    fb.map((b) => n.byBranch?.find((x) => x.branchId === b.id));
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
  const [openCats, setOpenCats] = useState<Set<number>>(new Set());
  const woMap = useMemo(
    () => new Map((writeoff ?? []).map((w) => [`${w.level}:${w.id}`, w])),
    [writeoff]
  );
  const wo = (level: WoCell["level"], id: number) => woMap.get(`${level}:${id}`);
  /** Chiqim kataklari — AYNI tartibda (savdo bilan bir ustunda ko'rsatiladi). */
  const woBc = (level: WoCell["level"], id: number) => {
    const w = wo(level, id);
    return fb.map((b) => w?.byBranch?.find((x) => x.branchId === b.id));
  };
  const toggle = (set: Set<number>, id: number) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  };

  return (
    <ExpandableCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>Reja bajarilishi — bo&apos;lim va kategoriyalar</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            savdo: fakt ÷ reja · chiqim: fakt/reja %
          </span>
          {writeoffLimitPct != null && (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              title="Kompaniya bo'yicha chiqim chegarasi (Sozlamalar)"
            >
              chiqim chegarasi {writeoffLimitPct.toFixed(1)}%
            </span>
          )}
        </span>
      }
      className="rounded-2xl border-border/50"
    >
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs italic text-muted-foreground">Ma&apos;lumot yo&apos;q</p>
      ) : (
        // Filial ustunlari qo'shilganda qator kengayadi — tor ekranda nom ustuni
        // siqilib ketmasligi uchun gorizontal skroll (jadval o'zi qisqarmaydi).
        <div className={cn("space-y-0.5 pt-1", fb.length > 0 && "overflow-x-auto")}>
          <div className={cn(fb.length > 0 && "min-w-[860px]")}>
          {/* Ustun sarlavhalari */}
          <div className="flex items-center gap-2 px-2 pb-1 pl-8 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">Bo&apos;lim / kategoriya</span>
            <span className="w-[96px] text-center">Chiqim</span>
            {fb.map((b) => (
              <span key={b.id} className="w-[68px] truncate text-right" title={`${b.name} — yuqorida savdo rejasi %, pastida chiqim fakt/reja %`}>
                {b.name}
              </span>
            ))}
            <span className="w-24">Savdo rejasi</span>
            <span className="w-14 text-right">{fb.length > 0 ? "Jami" : "%"}</span>
          </div>
          {data.map((g) => {
            const gOpen = openGroups.has(g.id);
            return (
              <div key={g.id}>
                <button
                  onClick={() => setOpenGroups((p) => toggle(p, g.id))}
                  aria-expanded={gOpen}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", gOpen && "rotate-90")} />
                  <span className="flex-1 truncate text-sm font-semibold">{g.name}</span>
                  <WoBadge wo={wo("g", g.id)} />
                  {bc(g).map((cell, i) => <BranchPct key={fb[i].id} cell={cell} wo={woBc("g", g.id)[i]} />)}
                  <PlanMiniBar pct={g.planPct} />
                  <PlanPct pct={g.planPct} />
                </button>

                {gOpen && (
                  <div className="mb-1 ml-[19px] space-y-0.5 border-l border-border/50 pl-2">
                    {g.categories.map((c) => {
                      const cOpen = openCats.has(c.id);
                      return (
                        <div key={c.id}>
                          <button
                            onClick={() => setOpenCats((p) => toggle(p, c.id))}
                            aria-expanded={cOpen}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                cOpen && "rotate-90",
                                c.subs.length === 0 && "opacity-0"
                              )}
                            />
                            <span className="flex-1 truncate text-[13px]">{c.name}</span>
                            <WoBadge wo={wo("c", c.id)} />
                            {bc(c).map((cell, i) => <BranchPct key={fb[i].id} cell={cell} wo={woBc("c", c.id)[i]} />)}
                            <PlanMiniBar pct={c.planPct} />
                            <PlanPct pct={c.planPct} />
                          </button>

                          {cOpen && c.subs.length > 0 && (
                            <div className="mb-1 ml-[15px] space-y-0.5 border-l border-border/50 pl-3">
                              {c.subs.map((s) => (
                                <div key={s.id} className="flex items-center gap-2 py-1">
                                  <span className="flex-1 truncate text-xs text-muted-foreground">{s.name}</span>
                                  <WoBadge wo={wo("s", s.id)} small />
                                  {bc(s).map((cell, i) => <BranchPct key={fb[i].id} cell={cell} wo={woBc("s", s.id)[i]} small />)}
                                  <PlanMiniBar pct={s.planPct} small />
                                  <PlanPct pct={s.planPct} small />
                                </div>
                              ))}
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
        </div>
      )}
    </ExpandableCard>
  );
}

// ============ 5 & 6. KPI by branch (cards) ============

type KpiByBranchTrendRow = KpiByBranchRow & {
  conversionTrend?: number | null;
};

export function ConversionWidget({
  rows,
  trend,
}: {
  rows: KpiByBranchTrendRow[];
  trend?: number | null;
}) {
  return (
    <ExpandableCard title={<WidgetTitle title="Konversiya" trend={trend} />} className="rounded-2xl">
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.branchId} className="rounded-xl bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground truncate">{r.branchName}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {r.conversion != null ? `${r.conversion.toFixed(1)}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(r.receipts)} chek / {formatNumber(r.visits)} tashrif
            </div>
            <TrendIndicator value={r.conversionTrend} />
          </div>
        ))}
      </div>
    </ExpandableCard>
  );
}

// ============ Guruh/Kategoriya kunlik savdo dinamikasi ============

// Har bir guruh nomi uchun barqaror rang — chart chiziqlar uchun
const GROUP_COLORS: Record<string, string> = {
  "FRESH":    "#10b981",
  "FOOD":     "#facc15",
  "NON-FOOD": "#6366f1",
};
type GroupMeta = { id: number; name: string };

/**
 * Guruhlar bo'yicha kunlik savdo — Sotuv Dashboardidagi "Kunlik reja vs fakt"
 * chart (DailySalesChart: Fakt yashil ustun + Reja orange punktir) asosida.
 * Qo'shimcha: guruh filtri (har guruh alohida) + davr bo'yicha ulush donut.
 */
export function GroupSalesDynamicsWidget({
  days,
  groups,
  planDays = [],
}: {
  days: GroupSalesDayRow[];
  groups: GroupMeta[];
  planDays?: GroupPlanDayRow[];
}) {
  const [activeGroup, setActiveGroup] = useState<number | null>(null);

  // Faol ko'lam (Barcha guruhlar = jami, yoki bitta guruh) uchun kunlik Fakt + Reja.
  // useMemo: guruh filtri har bosilganda 30+ kunlik massivlar qayta qurilmasin.
  const { faktSeries, rejaSeries } = useMemo(() => {
    const planByDate = new Map(planDays.map((p) => [p.date, p]));
    return {
      faktSeries: days.map((d) => ({
        date: d.date,
        value: activeGroup == null ? d.total : d.groups.find((g) => g.groupId === activeGroup)?.amount ?? 0,
      })),
      rejaSeries: days.map((d) => {
        const pd = planByDate.get(d.date);
        const plan = activeGroup == null ? pd?.total ?? 0 : pd?.groups.find((g) => g.groupId === activeGroup)?.plan ?? 0;
        return { date: d.date, value: plan };
      }),
    };
  }, [days, planDays, activeGroup]);
  const hasReja = rejaSeries.some((r) => r.value > 0);

  // Donut: davr bo'yicha guruh ulushi (fakt asosida) — guruh filtriga bog'liq emas
  const groupTotals = useMemo(
    () =>
      groups
        .map((g) => ({
          id: g.id,
          name: g.name,
          value: days.reduce((s, d) => s + (d.groups.find((x) => x.groupId === g.id)?.amount ?? 0), 0),
          color: GROUP_COLORS[g.name] ?? "#94a3b8",
        }))
        .filter((x) => x.value > 0),
    [groups, days]
  );
  const grand = groupTotals.reduce((s, x) => s + x.value, 0);
  const activeName = activeGroup == null ? "Barcha guruhlar" : groups.find((g) => g.id === activeGroup)?.name ?? "";

  return (
    <ExpandableCard title="Guruhlar bo'yicha kunlik savdo" className="rounded-2xl">
        {/* Guruh filtri */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveGroup(null)}
            className={cn(
              "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
              activeGroup === null
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/40"
            )}
          >
            Barcha guruhlar
          </button>
          {groups.map((g) => {
            const color = GROUP_COLORS[g.name] ?? "#94a3b8";
            const active = activeGroup === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setActiveGroup(active ? null : g.id)}
                className={cn("h-7 rounded-full border px-3 text-xs font-semibold transition-all", active ? "shadow-sm scale-[1.03]" : "opacity-70 hover:opacity-100")}
                style={{ backgroundColor: active ? color + "22" : "transparent", borderColor: color, color }}
              >
                {g.name}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Kunlik Reja vs Fakt (Sotuv chart namunasi) */}
          <div className="lg:col-span-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{activeName} — kunlik Reja vs Fakt</p>
            <DailySalesChart sales={faktSeries} forecast={hasReja ? rejaSeries : undefined} />
          </div>

          {/* Davr bo'yicha ulush (donut, summasiz — faqat %) */}
          <div className="flex flex-col">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Davr bo&apos;yicha ulush</p>
            {groupTotals.length === 0 ? (
              <div className="flex h-72 items-center justify-center text-xs italic text-muted-foreground">Ma&apos;lumot yo&apos;q</div>
            ) : (
              <ResponsiveContainer width="100%" height={288}>
                <PieChart>
                  <Pie data={groupTotals} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="var(--card)">
                    {groupTotals.map((e) => <Cell key={e.id} fill={e.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, n) => [`${grand > 0 ? ((Number(v) / grand) * 100).toFixed(1) : "0"}%`, String(n)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
      </div>
    </ExpandableCard>
  );
}

/**
 * Savdo ulushi — ichma-ich (nested) donut: ichki halqa = guruhlar, tashqi = top
 * kategoriyalar. Har slice umumiy savdoga nisbatan % (hover). marjaHierarchy ma'lumotidan.
 */
export function SalesShareWidget({ data }: { data: MarjaGroupNode[] }) {
  const groupData = data
    .map((g) => ({ name: g.name, value: g.sales, color: GROUP_COLORS[g.name] ?? "#94a3b8" }))
    .filter((x) => x.value > 0);
  const total = groupData.reduce((s, x) => s + x.value, 0);

  // Kategoriya rangi = guruh rangi + kamayuvchi shaffoflik (guruh bo'yicha gruppalangan)
  const ALPHA = ["", "DD", "BB", "99", "80", "66", "55", "44"];
  const catData = data.flatMap((g) => {
    const base = GROUP_COLORS[g.name] ?? "#94a3b8";
    return g.categories
      .filter((c) => c.sales > 0)
      .map((c, i) => ({ name: c.name, value: c.sales, color: base + (ALPHA[i % ALPHA.length] ?? "") }));
  });

  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%");

  return (
    <ExpandableCard title="Savdo ulushi — guruh va kategoriyalar" className="rounded-2xl">
        {total === 0 ? (
          <p className="py-10 text-center text-xs italic text-muted-foreground">Tanlangan davrda savdo ma&apos;lumoti yo&apos;q.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={360}>
                <PieChart>
                  {/* Ichki halqa — guruhlar */}
                  <Pie data={groupData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={84} paddingAngle={1} stroke="var(--card)">
                    {groupData.map((e, i) => <Cell key={`g${i}`} fill={e.color} />)}
                  </Pie>
                  {/* Tashqi halqa — kategoriyalar */}
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={90} outerRadius={132} paddingAngle={0.5} stroke="var(--card)">
                    {catData.map((e, i) => <Cell key={`c${i}`} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [pct(Number(v)), String(n)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Guruh ulushlari */}
            <div className="flex flex-col justify-center gap-2">
              {groupData.map((g) => (
                <div key={g.name} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="flex-1 truncate font-medium">{g.name}</span>
                  <span className="font-semibold tabular-nums">{pct(g.value)}</span>
                </div>
              ))}
            <p className="mt-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                Ichki halqa — guruhlar, tashqi — kategoriyalar. Hover: umumiyga nisbatan ulush %.
              </p>
            </div>
          </div>
        )}
    </ExpandableCard>
  );
}
