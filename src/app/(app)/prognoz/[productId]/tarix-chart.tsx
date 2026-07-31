"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CSSProperties } from "react";
import type { HaftaNuqta } from "@/lib/prognoz/oqish";

const YASHIL = "#10b981";
const KOK = "#0ea5e9";
const KULRANG = "#94a3b8";

const tooltipStyle: CSSProperties = {
  backgroundColor: "var(--card)",
  borderRadius: "12px",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  fontSize: "13px",
};

const qisqaSana = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}` : iso;
};

/**
 * Haftalik tarix + prognoz oynasi.
 *
 * Prognoz BITTA hafta uchun emas, 4 haftaning JAMISI uchun berilgan (o'lchov aynan
 * shunday validatsiya qilingan). Shu sabab kelajak haftalarga chiziq CHIZILMAYDI —
 * o'rniga oyna soyalanadi va o'rtacha daraja (p50/gorizont) punktir bilan beriladi.
 * Haftalik chiziq chizilsa, o'lchanmagan aniqlik va'da qilingan bo'lardi.
 */
export function TarixChart({
  tarix,
  p50,
  q90,
  horizon,
  targetFrom,
  targetTo,
}: {
  tarix: HaftaNuqta[];
  p50: number;
  q90: number;
  horizon: number;
  targetFrom: string;
  targetTo: string;
}) {
  const haftalikP50 = p50 / horizon;
  const haftalikQ90 = q90 / horizon;

  // Kelajak haftalari o'qda ko'rinishi uchun bo'sh nuqta sifatida qo'shiladi
  const kelajak: HaftaNuqta[] = [];
  const bosh = new Date(`${targetFrom}T00:00:00.000Z`).getTime();
  for (let i = 0; i < horizon; i++) {
    kelajak.push({ hafta: new Date(bosh + i * 7 * 86_400_000).toISOString().slice(0, 10), qty: NaN, stockout: false });
  }

  const data = [...tarix, ...kelajak].map((x) => ({
    hafta: qisqaSana(x.hafta),
    fakt: Number.isNaN(x.qty) ? null : x.qty,
    stockout: x.stockout,
    prognoz: Number.isNaN(x.qty) ? haftalikP50 : null,
    zaxira: Number.isNaN(x.qty) ? haftalikQ90 : null,
  }));

  const oynaBosh = qisqaSana(targetFrom);
  const oynaOxir = qisqaSana(targetTo);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="hafta" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, nom) => [typeof v === "number" ? v.toFixed(1) : "—", String(nom)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceArea x1={oynaBosh} x2={oynaOxir} fill={KOK} fillOpacity={0.07} />
          <Area
            type="monotone"
            dataKey="zaxira"
            name="Zaxira tavsiyasi (haftaga)"
            stroke={KULRANG}
            strokeDasharray="4 4"
            fill={KULRANG}
            fillOpacity={0.12}
            connectNulls
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="prognoz"
            name="Prognoz (haftaga o'rtacha)"
            stroke={KOK}
            strokeWidth={2}
            strokeDasharray="5 5"
            connectNulls
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="fakt"
            name="Fakt (hafta)"
            stroke={YASHIL}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
