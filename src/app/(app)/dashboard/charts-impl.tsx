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

const COLORS = ["#B7EB76", "#FF8730", "#7B69EE", "#4EC8E4", "#F87171", "#34D399"];
const GREEN = "#B7EB76";
const ORANGE = "#FF8730";

function shortDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}`;
}

// Chiroyli va barcha grafiklarga mos tushuvchi Tooltip stili
const tooltipStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e8f5e0",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  color: "#1a2332",
  fontSize: "13px",
  fontFamily: "Inter, sans-serif",
};

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
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatUZS(v as number, { compact: true })}
            fontSize={11}
          />
          <YAxis yAxisId="right" orientation="right" fontSize={11} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const v = Number(value);
              if (name === "Savdo") return [formatUZS(v) + " so'm", name];
              return [formatNumber(v), name];
            }}
            labelFormatter={(v) => `Sana: ${v}`}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="sales" name="Savdo" fill={GREEN} radius={[6, 6, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="receipts"
            name="Cheklar"
            stroke={ORANGE}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6, fill: ORANGE, strokeWidth: 2, stroke: "#fff" }}
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
            outerRadius={80}
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
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatUZS(v as number, { compact: true })}
            fontSize={11}
          />
          <YAxis
            type="category"
            dataKey="categoryName"
            fontSize={10}
            width={130}
            tick={{ fontSize: 10 }}
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
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              if (name === "Marja") return [`${Number(value).toFixed(1)}%`, name];
              return [formatUZS(Number(value)) + " so'm", name];
            }}
          />
          <Legend />
          <Bar dataKey="plan" name="Reja" fill="#E2F5C8" radius={[0, 4, 4, 0]} />
          <Bar dataKey="fact" name="Fakt" fill={GREEN} radius={[0, 4, 4, 0]} />
          {hasMarja && (
            <Line
              yAxisId="marja"
              type="monotone"
              dataKey="marja"
              name="Marja"
              stroke="#FF8730"
              strokeWidth={2}
              dot={{ r: 3, fill: "#FF8730" }}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
