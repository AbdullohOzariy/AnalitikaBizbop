"use client";

import type { CSSProperties } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatUZS, formatNumber } from "@/lib/format";

// Yangi Ranglar Palitrasi
const BRAND_GREEN = "#10b981"; // Primary Accent (Sizning logotipingiz yashiliga moslash uchun o'zgartirishingiz mumkin)
const YELLOW = "#facc15";      // Secondary 1 (Xantal sariq)
const ORANGE = "#fb923c";      // Secondary 2 (Yumshoq to'q sariq)
const RED = "#f87171";         // Alert / Negative
const GRAY = "#94a3b8";        // Neutral / Compare

const COLORS = [BRAND_GREEN, YELLOW, ORANGE, RED, "#6366f1", "#0ea5e9"];

function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

// Tooltip stili — CSS tokenlar orqali (dark mode'da ham o'qiladi; widgets.tsx bilan bir xil naqsh)
const tooltipStyle: CSSProperties = {
  backgroundColor: "var(--card)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: "16px",
  border: "1px solid var(--border)",
  boxShadow: "0 10px 40px -10px rgba(0,0,0,0.15)",
  color: "var(--foreground)",
  fontSize: "14px",
  fontFamily: "Sora, sans-serif",
};

const CHART_GRADIENTS = (
  <defs>
    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={BRAND_GREEN} stopOpacity={0.9} />
      <stop offset="100%" stopColor={BRAND_GREEN} stopOpacity={0.4} />
    </linearGradient>
    <linearGradient id="colorFact" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={BRAND_GREEN} stopOpacity={0.8} />
      <stop offset="100%" stopColor={BRAND_GREEN} stopOpacity={1} />
    </linearGradient>
    <linearGradient id="colorPlan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={GRAY} stopOpacity={0.4} />
      <stop offset="100%" stopColor={GRAY} stopOpacity={0.1} />
    </linearGradient>
  </defs>
);

export function DailyDynamicsChart({
  sales,
  receipts,
}: {
  sales: { date: string; value: number }[];
  receipts: { date: string; value: number }[];
}) {
  if (sales.length === 0 && receipts.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Kunlik metrika ma'lumoti yo'q.
      </div>
    );
  }

  // Sanalarni birlashtirish
  const map = new Map<string, { date: string; sales: number; receipts: number }>();
  for (const r of sales) {
    map.set(r.date, { date: r.date, sales: r.value, receipts: 0 });
  }
  for (const r of receipts) {
    const cur = map.get(r.date) ?? { date: r.date, sales: 0, receipts: 0 };
    cur.receipts = r.value;
    map.set(r.date, cur);
  }
  const data = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {CHART_GRADIENTS}
          <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatUZS(v as number, { compact: true })}
            fontSize={12}
            fill={GRAY}
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            fontFamily="Sora"
          />
          <YAxis yAxisId="right" orientation="right" fontSize={12} fill={GRAY} tickLine={false} axisLine={false} fontFamily="Sora" />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const v = Number(value);
              if (name === "Savdo") return [formatUZS(v) + " so'm", name];
              return [formatNumber(v), name];
            }}
            labelFormatter={(v) => `Sana: ${v}`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', fontFamily: 'Sora', paddingTop: '15px' }} />
          <Bar yAxisId="left" dataKey="sales" name="Savdo" fill="url(#colorSales)" radius={[12, 12, 12, 12]} barSize={16} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="receipts"
            name="Cheklar"
            stroke={YELLOW}
            strokeWidth={4}
            dot={false}
            activeDot={{ r: 6, fill: YELLOW, strokeWidth: 4, stroke: "#fff" }}
            style={{ filter: "drop-shadow(0px 8px 16px rgba(250, 204, 21, 0.3))" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BranchShareChart({
  data,
}: {
  data: { branchId: number; branchName: string; sales: number; share: number }[];
}) {
  const filtered = data.filter((d) => d.sales > 0).sort((a, b) => b.sales - a.sales);
  if (filtered.length === 0) {
    return (
      <div className="min-h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        Filiallar bo&apos;yicha savdo yo&apos;q.
      </div>
    );
  }
  const maxSales = filtered[0].sales;
  const total = filtered.reduce((s, d) => s + d.sales, 0);

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground mb-3">
        Jami: <span className="font-semibold text-foreground">{formatUZS(total, { compact: true })}</span>
      </p>
      <div className="space-y-3.5 overflow-y-auto max-h-[300px] pr-0.5">
        {filtered.map((d, i) => {
          const color = COLORS[i % COLORS.length];
          const pct = (d.sales / maxSales) * 100;
          return (
            <div key={d.branchId}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[13px] font-medium truncate leading-none">{d.branchName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground">{formatUZS(d.sales, { compact: true })}</span>
                  <span
                    className="text-[12px] font-bold tabular-nums w-[42px] text-right"
                    style={{ color }}
                  >
                    {d.share.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DailySalesChart({
  sales,
  forecast,
}: {
  sales: { date: string; value: number }[];
  forecast?: { date: string; value: number }[];
}) {
  const hasForecast = !!forecast && forecast.length > 0;
  if (sales.length === 0 && !hasForecast)
    return <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">Kunlik savdo ma&apos;lumoti yo&apos;q.</div>;

  // Sana bo'yicha fakt + prognozni birlashtiramiz (prognoz kelajak kunlarni ham qamrashi mumkin)
  const salesMap = new Map(sales.map((r) => [r.date, r.value]));
  const fcMap = new Map((forecast ?? []).map((r) => [r.date, r.value]));
  const dates = Array.from(new Set([...salesMap.keys(), ...fcMap.keys()])).sort();
  const data = dates.map((d) => ({
    date: d,
    sales: salesMap.get(d) ?? 0,
    forecast: fcMap.has(d) ? fcMap.get(d) : undefined,
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {CHART_GRADIENTS}
          <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <YAxis tickFormatter={(v) => formatUZS(v as number, { compact: true })} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [formatUZS(Number(v)) + " so'm", name as string]} labelFormatter={(v) => `Sana: ${v}`} />
          {hasForecast && <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Sora" }} iconType="plainline" />}
          <Bar dataKey="sales" name="Fakt savdo" fill="url(#colorSales)" radius={[12, 12, 12, 12]} barSize={16} />
          {hasForecast && (
            <Line
              type="monotone"
              dataKey="forecast"
              name="Reja (prognoz)"
              stroke={ORANGE}
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              activeDot={{ r: 5, fill: ORANGE, strokeWidth: 3, stroke: "#fff" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyReceiptsChart({ receipts }: { receipts: { date: string; value: number }[] }) {
  if (receipts.length === 0) return <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Chek soni ma'lumoti yo'q.</div>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={receipts.map(r => ({ date: r.date, receipts: r.value }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {CHART_GRADIENTS}
          <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <YAxis tickFormatter={(v) => formatNumber(v as number)} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Cheklar"]} labelFormatter={(v) => `Sana: ${v}`} />
          <Line type="monotone" dataKey="receipts" name="Cheklar" stroke={YELLOW} strokeWidth={4} dot={false} activeDot={{ r: 6, fill: YELLOW, strokeWidth: 4, stroke: "#fff" }} style={{ filter: "drop-shadow(0px 8px 16px rgba(250, 204, 21, 0.3))" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopCategoriesChart({
  data,
}: {
  data: {
    categoryId: number;
    categoryName: string;
    fact: number;
    marja: number | null;
  }[];
}) {
  const filtered = data.filter((d) => d.fact > 0);
  if (filtered.length === 0) {
    return (
      <div className="py-16 flex items-center justify-center text-sm text-muted-foreground">
        Kategoriya ma&apos;lumoti yo&apos;q.
      </div>
    );
  }

  const maxFact = Math.max(...filtered.map((d) => d.fact));

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full bg-emerald-500 inline-block" /> Fakt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full bg-orange-400 inline-block" /> Marja
        </span>
      </div>

      <div className="divide-y divide-border/30">
        {filtered.map((d, i) => {
          /* fact bar width: relative to max fact so bars fill nicely */
          const factW = maxFact > 0 ? (d.fact / maxFact) * 100 : 0;

          return (
            <div key={d.categoryId} className="py-3 first:pt-1 last:pb-1">
              {/* Row header */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-semibold text-muted-foreground w-5 shrink-0 text-right">
                    {i + 1}.
                  </span>
                  <span className="text-[13px] font-medium truncate">{d.categoryName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.marja != null && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-medium">
                      M {d.marja.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">
                    {formatUZS(d.fact, { compact: true })}
                  </span>
                </div>
              </div>

              {/* Fact bar */}
              <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{ width: `${factW}%`, backgroundColor: BRAND_GREEN }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
