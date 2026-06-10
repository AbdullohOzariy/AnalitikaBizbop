"use client";

import { useMemo, useState, useRef } from "react";
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
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { DailySalesChart } from "@/components/charts";
import type {
  MarjaRow,
  MarjaGroupNode,
  KpiByBranchRow,
  GroupSalesDayRow,
  GroupPlanDayRow,
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
            // Recharts formatter'ga dataKey emas, Line'ning name prop'i keladi
            // ("Tashriflar"/"Cheklar") — uni o'zini ishlatamiz, qayta map qilmaymiz
            // (eski `name === "tashrif"` sharti hech qachon to'g'ri kelmasdi —
            //  ikkala chiziq ham "Cheklar" deb chiqardi).
            formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
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
              {sortedData.map((d) => (
                <Cell
                  key={d.name}
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
    <div className="col-span-2">
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
    </div>
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
    <div className="col-span-2">
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
    </div>
  );
}
