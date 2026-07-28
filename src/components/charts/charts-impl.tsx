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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatUZS, formatNumber } from "@/lib/format";

// Yangi Ranglar Palitrasi
const BRAND_GREEN = "#10b981"; // Primary Accent (Sizning logotipingiz yashiliga moslash uchun o'zgartirishingiz mumkin)
const YELLOW = "#facc15";      // Secondary 1 (Xantal sariq)
const ORANGE = "#fb923c";      // Secondary 2 (Yumshoq to'q sariq)
const RED = "#f87171";         // Alert / Negative
const BLUE = "#0ea5e9";        // Tashriflar (Dashboard v2 bilan bir xil)
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
  // Summasiz — faqat ulush %. Bo'lak burchagi savdo hajmiga proporsional.
  const slices = filtered.map((d, i) => ({
    name: d.branchName,
    value: d.sales,
    share: d.share,
    color: COLORS[i % COLORS.length],
  }));
  const total = slices.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col">
      <div className="h-[210px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={92}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, n) => [
                `${total > 0 ? ((Number(v) / total) * 100).toFixed(1) : "0"}%`,
                String(n),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Afsona — nom + ulush % (summa ko'rsatilmaydi) */}
      <div className="mt-3 space-y-2 overflow-y-auto max-h-[130px] pr-0.5">
        {slices.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[13px] font-medium truncate leading-none flex-1">{s.name}</span>
            <span
              className="text-[12px] font-bold tabular-nums w-[46px] text-right"
              style={{ color: s.color }}
            >
              {s.share.toFixed(1)}%
            </span>
          </div>
        ))}
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

/** Kunlik son: tashrif va chek — bitta o'qda ikki chiziq (Dashboard v2 naqshi). */
export function DailyCountsChart({
  visits,
  receipts,
}: {
  visits: { date: string; value: number }[];
  receipts: { date: string; value: number }[];
}) {
  const map = new Map<string, { date: string; tashrif: number; chek: number }>();
  for (const r of visits) map.set(r.date, { date: r.date, tashrif: r.value, chek: 0 });
  for (const r of receipts) {
    const cur = map.get(r.date) ?? { date: r.date, tashrif: 0, chek: 0 };
    cur.chek = r.value;
    map.set(r.date, cur);
  }
  const data = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (data.length === 0)
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        Tashrif/chek ma&apos;lumoti yo&apos;q.
      </div>
    );

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {CHART_GRADIENTS}
          <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <YAxis tickFormatter={(v) => formatNumber(v as number)} fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, n) => [formatNumber(Number(v)), String(n)]}
            labelFormatter={(v) => `Sana: ${v}`}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: "13px", fontFamily: "Sora", paddingTop: "15px" }} />
          <Line
            type="monotone"
            dataKey="tashrif"
            name="Tashriflar"
            stroke={BLUE}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: BLUE, strokeWidth: 4, stroke: "#fff" }}
            style={{ filter: "drop-shadow(0px 8px 16px rgba(14, 165, 233, 0.25))" }}
          />
          <Line
            type="monotone"
            dataKey="chek"
            name="Cheklar"
            stroke={YELLOW}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: YELLOW, strokeWidth: 4, stroke: "#fff" }}
            style={{ filter: "drop-shadow(0px 8px 16px rgba(250, 204, 21, 0.3))" }}
          />
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
    /** Reja bajarilishi % (fakt ÷ reja). Reja kiritilmagan bo'lsa null. */
    planPct?: number | null;
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

  return (
    <div>
      {/* Legend — summa emas, reja bajarilishi ko'rsatiladi */}
      <div className="flex items-center gap-4 mb-4 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full bg-emerald-500 inline-block" /> Reja bajarilishi (≥100%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full bg-yellow-400 inline-block" /> 90–100%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full bg-red-400 inline-block" /> &lt; 90%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-full bg-orange-400 inline-block" /> Marja
        </span>
      </div>

      <div className="divide-y divide-border/30">
        {filtered.map((d, i) => {
          const pct = d.planPct ?? null;
          // Bar — reja bajarilishi (100% = to'la); 100%+ to'lgan holatda qoladi
          const barW = pct == null ? 0 : Math.max(0, Math.min(100, pct));
          const barColor = pct == null ? GRAY : pct >= 100 ? BRAND_GREEN : pct >= 90 ? YELLOW : RED;

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
                  <span
                    className="text-[12px] font-bold tabular-nums w-[52px] text-right"
                    style={{ color: pct == null ? undefined : barColor }}
                    title="Reja bajarilishi: fakt ÷ reja"
                  >
                    {pct == null ? "reja yo'q" : `${pct.toFixed(0)}%`}
                  </span>
                </div>
              </div>

              {/* Reja bajarilishi bar */}
              <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{ width: `${barW}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kumulyativ S-egri: yig'ilgan Reja vs yig'ilgan Fakt ───────────────────────
// Oy davomida qayerdan orqada qola boshlaganini ko'rsatadi: fakt chizig'i reja
// chizig'idan pastga tushgan kundan e'tiboran farq ochila boshlagan.
function buildCumulative(
  actual: { date: string; value: number }[],
  plan?: { date: string; value: number }[]
): { date: string; fakt: number; reja: number | null }[] {
  const planByDate = new Map((plan ?? []).map((p) => [p.date, p.value]));
  let cumA = 0;
  let cumP = 0;
  return actual.map((a) => {
    cumA += a.value;
    cumP += planByDate.get(a.date) ?? 0;
    return {
      date: shortDate(a.date),
      fakt: Math.round(cumA),
      reja: plan && plan.length > 0 ? Math.round(cumP) : null,
    };
  });
}

export function CumulativeChart({
  actual,
  plan,
}: {
  actual: { date: string; value: number }[];
  plan?: { date: string; value: number }[];
}) {
  const data = buildCumulative(actual, plan);
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Ma&apos;lumot yo&apos;q</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        {CHART_GRADIENTS}
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
        <XAxis dataKey="date" fontSize={12} fill={GRAY} tickLine={false} axisLine={false} tickMargin={10} fontFamily="Sora" interval="preserveStartEnd" />
        <YAxis fontSize={12} fill={GRAY} tickLine={false} axisLine={false} fontFamily="Sora" tickFormatter={(v) => formatUZS(Number(v), { compact: true })} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [formatUZS(Number(v)) + " so'm", name as string]}
          labelFormatter={(v) => `Sana: ${v}`}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: "13px", fontFamily: "Sora", paddingTop: "12px" }} />
        <Line type="monotone" dataKey="fakt" name="Fakt (yig'ilgan)" stroke={BRAND_GREEN} strokeWidth={3} dot={false}
          activeDot={{ r: 5, fill: BRAND_GREEN, strokeWidth: 3, stroke: "#fff" }} />
        <Line type="monotone" dataKey="reja" name="Reja (yig'ilgan)" stroke={GRAY} strokeWidth={2} strokeDasharray="6 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
