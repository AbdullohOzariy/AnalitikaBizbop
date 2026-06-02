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
} from "recharts";
import { Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatNumber, formatUZS } from "@/lib/format";
import { ExpandableCard } from "@/components/ui/expandable-card";
import type {
  PlanCompletionStats,
  DailyByBranchSeries,
  MarjaRow,
  KpiByBranchRow,
  GroupSalesDayRow,
  CategorySalesDayRow,
} from "@/lib/analytics-v2";

// Barqaror grafik palitra — faqat chiziq/bar ranglari uchun
const PALETTE = ["#10b981", "#facc15", "#fb923c", "#6366f1", "#0ea5e9", "#f87171", "#a855f7", "#14b8a6"];

function pctColor(p: number | null): string {
  if (p == null) return "text-muted-foreground";
  if (p >= 100) return "text-emerald-600";
  if (p >= 80) return "text-amber-600";
  return "text-red-500";
}
function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}.${m[1]}` : iso;
}

function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p.toFixed(1)}%`;
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

// ============ 1. Plan Completion ============

function MiniChip({ name, pct }: { name: string; pct: number | null }) {
  const dotBg =
    pct == null ? "bg-slate-300" :
    pct >= 100 ? "bg-emerald-500" :
    pct >= 80  ? "bg-amber-500" :
    "bg-red-400";
  return (
    <div
      title={`${name}: ${fmtPct(pct)}`}
      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 hover:bg-muted/70 transition-colors"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotBg}`} />
        <span className="text-xs font-medium truncate">{name}</span>
      </div>
      <span className={`text-xs font-semibold tabular-nums shrink-0 ${pctColor(pct)}`}>
        {fmtPct(pct)}
      </span>
    </div>
  );
}

export function PlanCompletionWidget({ data }: { data: PlanCompletionStats }) {
  const { overall, byCategory, byBranch } = data;
  const sortedCats = [...byCategory].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const sortedBranches = [...byBranch].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  return (
    <ExpandableCard title="Reja bajarilishi" className="rounded-2xl" headerClassName="pb-3" contentClassName="space-y-4">
      <div className="flex items-baseline gap-3">
        <div className={`text-4xl font-bold tabular-nums ${pctColor(overall.pct)}`}>
          {fmtPct(overall.pct)}
        </div>
        <div className="text-xs text-muted-foreground">umumiy</div>
      </div>

      {sortedBranches.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Filiallar
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sortedBranches.map((b) => (
              <MiniChip key={b.branchId} name={b.branchName} pct={b.pct} />
            ))}
          </div>
        </div>
      )}

      {sortedCats.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Kategoriyalar ({sortedCats.length})
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sortedCats.map((c) => (
              <MiniChip key={c.categoryId} name={c.categoryName} pct={c.pct} />
            ))}
          </div>
        </div>
      )}

      {sortedCats.length === 0 && sortedBranches.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          Reja yoki sotuv ma&apos;lumoti yo&apos;q
        </p>
      )}
    </ExpandableCard>
  );
}

// ============ 2 & 3. Daily by branch (line chart) ============

export function DailyByBranchWidget({
  title,
  data,
  unit = "",
  format = "number",
  trend,
}: {
  title: string;
  data: DailyByBranchSeries;
  unit?: string;
  format?: "number" | "uzs-compact";
  trend?: number | null;
}) {
  const fmt =
    format === "uzs-compact"
      ? (v: number) => (v === 0 ? "—" : formatUZS(v, { compact: true }))
      : (v: number) => `${formatNumber(v)}${unit ? " " + unit : ""}`;
  const chartData = data.values.map((v) => ({
    ...v,
    _label: shortDate(v.date as string),
  }));
  return (
    <ExpandableCard title={<WidgetTitle title={title} trend={trend} />} className="rounded-2xl">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
          <XAxis dataKey="_label" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: CHART_TICK_FILL }} tickFormatter={(v) => fmt(Number(v))} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [fmt(Number(value)), ""]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.branches.map((b, i) => (
            <Line
              key={b.id}
              type="monotone"
              dataKey={`b${b.id}`}
              name={b.name}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ExpandableCard>
  );
}

// ============ 4. Marja breakdown ============

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
          <span>Marja foizi: Filiallar</span>
          <MarjaInfoTooltip />
        </div>
      }
      rows={data}
    />
  );
}

export function MarjaByCategoryWidget({ data }: { data: MarjaRow[] }) {
  return (
    <MarjaBaseWidget
      title={
        <div className="flex items-center gap-2">
          <span>Marja foizi: Kategoriyalar</span>
          <MarjaInfoTooltip />
        </div>
      }
      rows={data}
    />
  );
}

// ============ 5 & 6. KPI by branch (cards) ============

type KpiByBranchTrendRow = KpiByBranchRow & {
  conversionTrend?: number | null;
  avgItemsTrend?: number | null;
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

export function AvgItemsWidget({
  rows,
  trend,
}: {
  rows: KpiByBranchTrendRow[];
  trend?: number | null;
}) {
  return (
    <ExpandableCard title={<WidgetTitle title="Chekdagi o'rt. tovar soni" trend={trend} />} className="rounded-2xl">
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.branchId} className="rounded-xl bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground truncate">{r.branchName}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">
              {r.avgItemsPerReceipt != null ? r.avgItemsPerReceipt.toFixed(2) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(r.receipts)} chekdan
            </div>
            <TrendIndicator value={r.avgItemsTrend} />
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
}: {
  days: GroupSalesDayRow[];
  groups: GroupMeta[];
  categoryDataMap: Map<number, { days: CategorySalesDayRow[]; categories: { id: number; name: string }[] }>;
}) {
  const [activeGroup, setActiveGroup] = useState<number | null>(null);

  // Guruhlar bo'yicha chart data + kunlik jami (_total)
  const groupChartData = days.map((d) => {
    const row: Record<string, string | number> = { _label: shortDate(d.date) };
    let total = 0;
    for (const g of d.groups) {
      row[`g${g.groupId}`] = g.amount;
      total += g.amount;
    }
    row["_total"] = total;
    return row;
  });

  // Tanlangan guruh uchun kategoriya chart data
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

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={groupChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis dataKey="_label" tick={{ fontSize: 11, fill: CHART_TICK_FILL }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: CHART_TICK_FILL }} tickFormatter={(v) => fmtUZS(Number(v))} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                if (name === "_total") return [fmtUZS(Number(value)), "Jami"];
                const g = groups.find((g) => `g${g.id}` === name);
                return [fmtUZS(Number(value)), g?.name ?? String(name)];
              }}
            />
            <Legend
              formatter={(value) => {
                if (value === "_total") return "Jami";
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
                strokeWidth={activeGroup === null || activeGroup === g.id ? 2 : 1}
                opacity={activeGroup === null || activeGroup === g.id ? 1 : 0.2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {/* Umumiy jami chizig'i — faqat "Barcha guruhlar" rejimida */}
            {showTotal && (
              <Line
                type="monotone"
                dataKey="_total"
                name="_total"
                stroke={TOTAL_LINE_COLOR}
                strokeWidth={3}
                strokeDasharray="0"
                dot={false}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
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
        </ExpandableCard>
      )}
    </div>
  );
}
