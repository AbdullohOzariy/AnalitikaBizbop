"use client";

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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type {
  PlanCompletionStats,
  DailyByBranchSeries,
  MarjaRow,
  KpiByBranchRow,
} from "@/lib/analytics-v2";

const PALETTE = ["#10b981", "#facc15", "#fb923c", "#6366f1", "#0ea5e9", "#f87171", "#a855f7", "#14b8a6"];

function pctColor(p: number | null): string {
  if (p == null) return "text-muted-foreground";
  if (p >= 100) return "text-emerald-600";
  if (p >= 80) return "text-amber-600";
  return "text-red-500";
}
function pctBgColor(p: number | null): string {
  if (p == null) return "bg-muted";
  if (p >= 100) return "bg-emerald-500";
  if (p >= 80) return "bg-amber-500";
  return "bg-red-400";
}

function shortDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}.${m[1]}` : iso;
}

function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p.toFixed(1)}%`;
}

const tooltipStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.85)",
  backdropFilter: "blur(12px)",
  borderRadius: "12px",
  border: "none",
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.08)",
  fontSize: "13px",
};

// ============ 1. Plan Completion ============

export function PlanCompletionWidget({ data }: { data: PlanCompletionStats }) {
  const { overall, byCategory, byBranch } = data;

  const renderRow = (name: string, pct: number | null) => {
    const clamped = pct == null ? 0 : Math.min(Math.max(pct, 0), 150);
    const widthPct = (clamped / 150) * 100;
    return (
      <div key={name} className="space-y-1">
        <div className="flex justify-between items-baseline text-xs">
          <span className="font-medium truncate pr-2">{name}</span>
          <span className={`tabular-nums font-semibold ${pctColor(pct)}`}>{fmtPct(pct)}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden relative">
          <div className={`h-full ${pctBgColor(pct)} transition-all`} style={{ width: `${widthPct}%` }} />
          <div className="absolute top-0 bottom-0 w-px bg-foreground/30" style={{ left: `${(100 / 150) * 100}%` }} />
        </div>
      </div>
    );
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">1. Reja bajarilishi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Umumiy</div>
          <div className={`text-4xl font-bold tabular-nums ${pctColor(overall.pct)}`}>
            {fmtPct(overall.pct)}
          </div>
        </div>

        {byCategory.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Kategoriyalar
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {byCategory.map((c) => renderRow(c.categoryName, c.pct))}
            </div>
          </div>
        )}

        {byBranch.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Filiallar
            </div>
            <div className="space-y-2">
              {byBranch.map((b) => renderRow(b.branchName, b.pct))}
            </div>
          </div>
        )}

        {byCategory.length === 0 && byBranch.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            Reja yoki sotuv ma'lumoti yo'q
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============ 2 & 3. Daily by branch (line chart) ============

export function DailyByBranchWidget({
  title,
  data,
  unit = "",
}: {
  title: string;
  data: DailyByBranchSeries;
  unit?: string;
}) {
  const chartData = data.values.map((v) => ({
    ...v,
    _label: shortDate(v.date as string),
  }));
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="_label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [`${formatNumber(Number(value))}${unit ? " " + unit : ""}`, ""]}
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
      </CardContent>
    </Card>
  );
}

// ============ 4. Marja breakdown ============

export function MarjaWidget({
  byCategory,
  byBranch,
}: {
  byCategory: MarjaRow[];
  byBranch: MarjaRow[];
}) {
  const renderBars = (rows: MarjaRow[]) => {
    if (rows.length === 0) {
      return <p className="text-xs text-muted-foreground italic text-center py-2">Ma'lumot yo'q</p>;
    }
    const data = rows.map((r) => ({ name: r.name, marja: r.marja ?? 0, hasCost: r.cost > 0 }));
    return (
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, "Marja"]}
          />
          <Bar dataKey="marja" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  !d.hasCost ? "#cbd5e1" :
                  d.marja >= 30 ? "#10b981" :
                  d.marja >= 15 ? "#facc15" :
                  "#f87171"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">4. Marja foizi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Filiallar
          </div>
          {renderBars(byBranch)}
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Kategoriyalar
          </div>
          {renderBars(byCategory)}
        </div>
      </CardContent>
    </Card>
  );
}

// ============ 5 & 6. KPI by branch (cards) ============

export function ConversionWidget({ rows }: { rows: KpiByBranchRow[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">5. Konversiya</CardTitle>
      </CardHeader>
      <CardContent>
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
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AvgItemsWidget({ rows }: { rows: KpiByBranchRow[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base">6. Chekdagi o'rt. tovar soni</CardTitle>
      </CardHeader>
      <CardContent>
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
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
