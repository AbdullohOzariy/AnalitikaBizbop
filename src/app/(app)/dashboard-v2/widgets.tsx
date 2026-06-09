"use client";

import { useState, useRef } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
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
import { cn } from "@/lib/utils";
import { ExpandableCard } from "@/components/ui/expandable-card";
import type {
  MarjaRow,
  MarjaGroupNode,
  KpiByBranchRow,
  GroupSalesDayRow,
  CategorySalesDayRow,
  GroupPlanDayRow,
} from "@/lib/analytics-v2";

function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}.${m[1]}` : iso;
}

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

// Grafik o'qi / grid uchun CSS token yordamchi qiymatlari
// (recharts SVG elementlari CSS variables qo'llab-quvvatlamaydi,
//  shuning uchun bir joyda saqlangan o'zgaruvchilar orqali boshqaramiz)
const CHART_GRID_STROKE = "var(--border)";
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

// ============ Kunlik son dinamikasi (Tashriflar + Cheklar) ============

export function CountDynamicsWidget({
  title,
  data,
  trend,
}: {
  title: string;
  data: { label: string; tashrif: number; chek: number }[];
  trend?: number | null;
}) {
  return (
    <ExpandableCard title={<WidgetTitle title={title} trend={trend} />} className="rounded-2xl">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: CHART_TICK_FILL }} tickFormatter={(v) => formatNumber(Number(v))} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [formatNumber(Number(value)), name === "tashrif" ? "Tashriflar" : "Cheklar"]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="tashrif" name="Tashriflar" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="chek" name="Cheklar" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </ExpandableCard>
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
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#81b29a] inline-block" />≥ 30%
              </span>
              <span>Yaxshi</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#f2c94c] inline-block" />15–30%
              </span>
              <span>O&apos;rtacha</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#e07a5f] inline-block" />&lt; 15%
              </span>
              <span>Past</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MarjaBaseWidget({ title, rows }: { title: React.ReactNode; rows: MarjaRow[] }) {
  const sortedData = [...rows]
    .sort((a, b) => (b.marja ?? -100) - (a.marja ?? -100))
    .map((r) => ({ name: r.name, marja: r.marja ?? 0, hasCost: r.cost > 0 }));

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
              {sortedData.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    !d.hasCost ? "#f1f5f9" :
                    d.marja >= 30 ? "#81b29a" :
                    d.marja >= 15 ? "#f2c94c" :
                    "#e07a5f"
                  }
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
const CAT_PALETTE = [
  "#10b981","#34d399","#6ee7b7","#facc15","#fde047","#fef08a",
  "#6366f1","#818cf8","#a5b4fc","#fb923c","#f97316","#ea580c",
  "#0ea5e9","#38bdf8","#7dd3fc","#f87171","#ef4444","#dc2626",
];

// Primary yashil token — "Jami" chizig'i uchun
const TOTAL_LINE_COLOR = "#1FBF5C";

type GroupMeta = { id: number; name: string };

export function GroupSalesDynamicsWidget({
  days,
  groups,
  categoryDataMap,
  dailyPlan = [],
  planDays = [],
}: {
  days: GroupSalesDayRow[];
  groups: GroupMeta[];
  categoryDataMap: Map<number, { days: CategorySalesDayRow[]; categories: { id: number; name: string }[] }>;
  /** Kunlik reja JAMI (ForecastDay) — umumiy Fakt vs Reja chizig'i uchun */
  dailyPlan?: { date: string; value: number }[];
  /** Kunlik reja HAR GURUH bo'yicha — guruh tanlanganda Fakt vs Reja uchun */
  planDays?: GroupPlanDayRow[];
}) {
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const planByDate = new Map(dailyPlan.map((p) => [p.date, p.value]));

  // Guruh kunlik rejasi: date → groupId → reja (guruh tanlanganda ishlatiladi)
  const groupPlanByDate = new Map<string, Map<number, number>>();
  for (const d of planDays) {
    const m = new Map<number, number>();
    for (const g of d.groups) m.set(g.groupId, g.plan);
    groupPlanByDate.set(d.date, m);
  }

  // Guruhlar bo'yicha chart data + kunlik jami (_total=Fakt, _plan=Reja)
  const groupChartData = days.map((d) => {
    const row: Record<string, string | number> = { _label: shortDate(d.date) };
    let total = 0;
    for (const g of d.groups) {
      row[`g${g.groupId}`] = g.amount;
      total += g.amount;
    }
    row["_total"] = total;
    row["_plan"] = planByDate.get(d.date) ?? 0;
    return row;
  });
  const hasPlan = dailyPlan.some((p) => p.value > 0);

  // Tanlangan guruh uchun: kunlik Fakt (yashil) vs Reja (to'q sariq punktir)
  const activeGroupName = activeGroup != null ? groups.find((g) => g.id === activeGroup)?.name : undefined;
  const groupPlanFactData =
    activeGroup != null
      ? days.map((d) => {
          const fact = d.groups.find((g) => g.groupId === activeGroup)?.amount ?? 0;
          const plan = groupPlanByDate.get(d.date)?.get(activeGroup) ?? 0;
          return { _label: shortDate(d.date), _fact: fact, _plan: plan };
        })
      : null;
  const activeGroupHasPlan = groupPlanFactData?.some((d) => d._plan > 0) ?? false;
  const activeGroupHasFact = groupPlanFactData?.some((d) => d._fact > 0) ?? false;

  // Tanlangan guruh uchun kategoriya chart data (ulush % — qo'shimcha kontekst)
  const catData = activeGroup != null ? categoryDataMap.get(activeGroup) : null;
  const catChartData = catData
    ? catData.days.map((d) => {
        const row: Record<string, string | number> = { _label: shortDate(d.date) };
        for (const c of d.categories) row[`c${c.categoryId}`] = c.pct;
        return row;
      })
    : null;

  const fmtUZS = (v: number) => v === 0 ? "—" : formatUZS(v, { compact: true });

  // "Barcha guruhlar" rejimida jami ko'rsatiladimi?
  const showTotal = activeGroup === null;

  // ── Donut: davr bo'yicha umumiy ulush ──────────────────────────────────────
  // Guruhlar bo'yicha jami (butun davr)
  const groupTotals = groups
    .map((g) => {
      let value = 0;
      for (const d of days) value += d.groups.find((x) => x.groupId === g.id)?.amount ?? 0;
      return { id: g.id, name: g.name, value, color: GROUP_COLORS[g.name] ?? "#94a3b8" };
    })
    .filter((x) => x.value > 0);
  const groupGrand = groupTotals.reduce((s, x) => s + x.value, 0);

  // Davrda umuman fakt savdo bormi? (groupGrand=0 va reja yo'q → bo'sh holat).
  // CategorySales faqat ayrim oylarda bor; tanlangan davrda (mas. joriy oy) bo'sh
  // bo'lsa, grafiklar 0 chiziq sifatida ko'rinib, foydalanuvchini chalg'itadi.
  const hasAnyData = groupGrand > 0 || hasPlan;

  // Tanlangan guruh kategoriyalari bo'yicha jami (butun davr)
  const catTotals = catData
    ? catData.categories
        .map((c, i) => {
          let value = 0;
          for (const d of catData.days) value += d.categories.find((x) => x.categoryId === c.id)?.amount ?? 0;
          return { id: c.id, name: c.name, value, color: CAT_PALETTE[i % CAT_PALETTE.length] };
        })
        .filter((x) => x.value > 0)
    : [];
  const catGrand = catTotals.reduce((s, x) => s + x.value, 0);

  return (
    <div className="col-span-2 space-y-4">
      {/* Guruhlar bo'yicha kunlik savdo */}
      <ExpandableCard title="Guruhlar bo'yicha kunlik savdo" className="rounded-2xl">
        {/* Guruh filtr tugmalari */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setActiveGroup(null)}
            className={`h-7 rounded-full px-3 text-xs font-medium border transition-colors ${
              activeGroup === null
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:border-foreground/40"
            }`}
          >
            Barcha guruhlar
          </button>
          {groups.map((g) => {
            const color = GROUP_COLORS[g.name] ?? "#94a3b8";
            const isActive = activeGroup === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setActiveGroup(isActive ? null : g.id)}
                className={`h-7 rounded-full px-3 text-xs font-semibold border transition-all ${
                  isActive ? "shadow-sm scale-[1.03]" : "opacity-70 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: isActive ? color + "22" : "transparent",
                  borderColor: color,
                  color: color,
                }}
              >
                {g.name}
              </button>
            );
          })}
        </div>

        {!hasAnyData ? (
          <p className="py-12 text-center text-xs italic text-muted-foreground">
            Tanlangan davr uchun savdo ma&apos;lumoti yo&apos;q.
            Boshqa davrni tanlang yoki <a href="/rejalar" className="underline underline-offset-2">Rejalar</a> bo&apos;limidan reja kiriting.
          </p>
        ) : (
        <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
        {/* Sarlavha: rejim — umumiy yoki tanlangan guruh Reja vs Fakt */}
        <div className="mb-1 flex items-center gap-2 text-xs">
          {showTotal ? (
            <span className="font-medium text-muted-foreground">Kunlik dinamika — Reja vs Fakt (jami)</span>
          ) : (
            <span className="font-semibold" style={{ color: GROUP_COLORS[activeGroupName ?? ""] ?? "#94a3b8" }}>
              {activeGroupName} — kunlik Reja vs Fakt
            </span>
          )}
        </div>
        {showTotal ? (
        /* ── Barcha guruhlar: umumiy Fakt vs Reja + guruh chiziqlari ── */
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={groupChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis dataKey="_label" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} interval="preserveStartEnd" />
            {/* Summa urg'ulanmaydi: o'q ixcham/muted, faqat shakl uchun mo'ljal */}
            <YAxis tick={{ fontSize: 10, fill: CHART_TICK_FILL }} tickFormatter={(v) => fmtUZS(Number(v))} width={44} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                if (name === "_total") return [fmtUZS(Number(value)), "Fakt"];
                if (name === "_plan") return [fmtUZS(Number(value)), "Reja"];
                const g = groups.find((g) => `g${g.id}` === name);
                return [fmtUZS(Number(value)), g?.name ?? String(name)];
              }}
            />
            <Legend
              formatter={(value) => {
                if (value === "_total") return "Fakt";
                if (value === "_plan") return "Reja";
                const g = groups.find((g) => `g${g.id}` === value);
                return g?.name ?? value;
              }}
              wrapperStyle={{ fontSize: 12 }}
            />
            {groups.map((g) => (
              <Line
                key={g.id}
                type="monotone"
                dataKey={`g${g.id}`}
                name={`g${g.id}`}
                stroke={GROUP_COLORS[g.name] ?? "#94a3b8"}
                strokeWidth={2}
                opacity={1}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {/* Fakt (jami) — yashil; Reja — to'q sariq punktir. */}
            <Line
              type="monotone"
              dataKey="_total"
              name="_total"
              stroke={TOTAL_LINE_COLOR}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
            {hasPlan && (
              <Line
                type="monotone"
                dataKey="_plan"
                name="_plan"
                stroke="#fb923c"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        ) : !activeGroupHasFact && !activeGroupHasPlan ? (
        /* ── Tanlangan guruh: ma'lumot ham, reja ham yo'q ── */
        <p className="py-16 text-center text-xs italic text-muted-foreground">
          {activeGroupName} uchun tanlangan davrda savdo va reja ma&apos;lumoti yo&apos;q.
        </p>
        ) : (
        /* ── Tanlangan guruh: Fakt (yashil) vs Reja (to'q sariq punktir) ── */
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={groupPlanFactData!} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis dataKey="_label" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} interval="preserveStartEnd" />
            {/* Summa urg'ulanmaydi: o'q ixcham/muted, faqat shakl uchun mo'ljal */}
            <YAxis tick={{ fontSize: 10, fill: CHART_TICK_FILL }} tickFormatter={(v) => fmtUZS(Number(v))} width={44} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtUZS(Number(value)), name === "_fact" ? "Fakt" : "Reja"]}
            />
            <Legend
              formatter={(value) => (value === "_fact" ? "Fakt" : "Reja")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="_fact"
              name="_fact"
              stroke={TOTAL_LINE_COLOR}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
            {activeGroupHasPlan && (
              <Line
                type="monotone"
                dataKey="_plan"
                name="_plan"
                stroke="#fb923c"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        )}
        </div>
        <div className="flex flex-col">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Davr bo&apos;yicha ulush</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={groupTotals} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="var(--card)">
                {groupTotals.map((e) => <Cell key={e.id} fill={e.color} />)}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, n) => [`${fmtUZS(Number(v))} · ${groupGrand > 0 ? ((Number(v) / groupGrand) * 100).toFixed(1) : "0"}%`, String(n)]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        </div>
        )}
      </ExpandableCard>

      {/* Kategoriyalar bo'yicha foiz dinamikasi (guruh tanlanganda) */}
      {activeGroup != null && catData && catData.categories.length > 0 && (
        <ExpandableCard
          title={`${groups.find((g) => g.id === activeGroup)?.name ?? ""} — kategoriyalar ulushi (%)`}
          className="rounded-2xl"
        >
          <p className="text-xs text-muted-foreground mb-3">
            Guruh ichidagi har bir kategoriyaning kunlik ulushi (%)
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={catChartData!} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="_label" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_TICK_FILL }}
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  const c = catData.categories.find((c) => `c${c.id}` === name);
                  return [`${Number(value).toFixed(1)}%`, c?.name ?? String(name)];
                }}
              />
              <Legend
                formatter={(value) => {
                  const c = catData.categories.find((c) => `c${c.id}` === value);
                  return c?.name ?? value;
                }}
                wrapperStyle={{ fontSize: 11 }}
              />
              {catData.categories.map((c, i) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={`c${c.id}`}
                  name={`c${c.id}`}
                  stroke={CAT_PALETTE[i % CAT_PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          </div>
          <div className="flex flex-col">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Davr bo&apos;yicha ulush</p>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={catTotals} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="var(--card)">
                  {catTotals.map((e) => <Cell key={e.id} fill={e.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => [`${fmtUZS(Number(v))} · ${catGrand > 0 ? ((Number(v) / catGrand) * 100).toFixed(1) : "0"}%`, String(n)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          </div>
        </ExpandableCard>
      )}
    </div>
  );
}
