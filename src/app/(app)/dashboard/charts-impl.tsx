"use client";

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
  BarChart,
} from "recharts";
import { formatUZS, formatNumber } from "@/lib/format";

// Apple-style Grayscale Soft Colors
const COLORS = ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6"];
const DARK_GRAY = "#111827";
const LIGHT_GRAY = "#9ca3af";

function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

// Chiroyli va barcha grafiklarga mos tushuvchi Tooltip stili (Glassmorphism)
const tooltipStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.75)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: "16px",
  border: "none",
  boxShadow: "0 10px 40px -10px rgba(0,0,0,0.08)",
  color: "#111827",
  fontSize: "14px",
  fontFamily: "Sora, sans-serif",
};

const ChartGradients = () => (
  <defs>
    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={DARK_GRAY} stopOpacity={0.9} />
      <stop offset="100%" stopColor={DARK_GRAY} stopOpacity={0.4} />
    </linearGradient>
    <linearGradient id="colorFact" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#374151" stopOpacity={0.9} />
      <stop offset="100%" stopColor="#111827" stopOpacity={1} />
    </linearGradient>
    <linearGradient id="colorPlan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#f3f4f6" stopOpacity={1} />
      <stop offset="100%" stopColor="#e5e7eb" stopOpacity={0.6} />
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
          <ChartGradients />
          <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} fill="#6b7280" tickLine={false} axisLine={false} tickMargin={12} fontFamily="Sora" />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatUZS(v as number, { compact: true })}
            fontSize={12}
            fill="#9ca3af"
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            fontFamily="Sora"
          />
          <YAxis yAxisId="right" orientation="right" fontSize={12} fill="#9ca3af" tickLine={false} axisLine={false} fontFamily="Sora" />
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
            stroke={LIGHT_GRAY}
            strokeWidth={4}
            dot={false}
            activeDot={{ r: 6, fill: DARK_GRAY, strokeWidth: 4, stroke: "#fff" }}
            style={{ filter: "drop-shadow(0px 8px 16px rgba(17, 24, 39, 0.15))" }}
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
  const filtered = data.filter((d) => d.sales > 0);
  if (filtered.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
        Filiallar bo'yicha savdo yo'q.
      </div>
    );
  }
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="sales"
            nameKey="branchName"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={85}
            paddingAngle={8}
            cornerRadius={12}
            stroke="none"
            label={(p: unknown) => {
              const x = p as { branchName: string; share: number };
              return `${x.branchName} ${x.share.toFixed(1)}%`;
            }}
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatUZS(Number(value)) + " so'm", "Savdo"]}
          />
        </PieChart>
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
    plan: number;
    achievement: number;
    marja: number | null;
  }[];
}) {
  const filtered = data.filter((d) => d.fact > 0);
  if (filtered.length === 0) {
    return (
      <div className="h-[520px] flex items-center justify-center text-sm text-muted-foreground">
        Kategoriya ma'lumoti yo'q.
      </div>
    );
  }

  // Marja uchun ikkinchi o'q (agar kamida bitta marja ma'lumoti bo'lsa)
  const hasMarja = filtered.some((d) => d.marja != null);

  return (
    <div className="h-[520px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={filtered}
          layout="vertical"
          margin={{ top: 5, right: hasMarja ? 60 : 10, left: 10, bottom: 5 }}
        >
          <ChartGradients />
          <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatUZS(v as number, { compact: true })}
            fontSize={12}
            fill="#9ca3af"
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            fontFamily="Sora"
          />
          <YAxis
            type="category"
            dataKey="categoryName"
            fontSize={12}
            width={140}
            tick={{ fontSize: 12, fill: "#6b7280", fontFamily: "Sora" }}
            tickLine={false}
            axisLine={false}
          />
          {hasMarja && (
            <YAxis
              yAxisId="marja"
              orientation="right"
              type="number"
              tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
              fontSize={10}
              width={50}
              domain={[0, "auto"]}
              tickLine={false}
              axisLine={false}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              if (name === "Marja") return [`${Number(value).toFixed(1)}%`, name];
              return [formatUZS(Number(value)) + " so'm", name];
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', fontFamily: 'Sora' }} />
          <Bar dataKey="plan" name="Reja" fill="url(#colorPlan)" radius={[12, 12, 12, 12]} barSize={10} />
          <Bar dataKey="fact" name="Fakt" fill="url(#colorFact)" radius={[12, 12, 12, 12]} barSize={10} />
          {hasMarja && (
            <Line
              yAxisId="marja"
              type="monotone"
              dataKey="marja"
              name="Marja"
              stroke={DARK_GRAY}
              strokeWidth={2.5}
              dot={{ r: 4, fill: DARK_GRAY, strokeWidth: 2, stroke: "#fff" }}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
