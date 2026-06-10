"use client";

/**
 * Recharts'li widgetlar serverda render qilinmaydi — charts/index.tsx bilan bir xil
 * naqsh: dynamic({ ssr: false }). Haqiqiy implementatsiya widgets-impl.tsx da.
 */
import dynamic from "next/dynamic";

const fallback = (h: string) => (
  <div className={`${h} flex items-center justify-center text-sm text-muted-foreground animate-pulse`}>
    Grafik yuklanmoqda...
  </div>
);

export const CountDynamicsWidget = dynamic(
  () => import("./widgets-impl").then((m) => m.CountDynamicsWidget),
  { ssr: false, loading: () => fallback("h-72") }
);

export const MarjaByBranchWidget = dynamic(
  () => import("./widgets-impl").then((m) => m.MarjaByBranchWidget),
  { ssr: false, loading: () => fallback("h-64") }
);

export const MarjaHierarchyWidget = dynamic(
  () => import("./widgets-impl").then((m) => m.MarjaHierarchyWidget),
  { ssr: false, loading: () => fallback("h-64") }
);

export const ConversionWidget = dynamic(
  () => import("./widgets-impl").then((m) => m.ConversionWidget),
  { ssr: false, loading: () => fallback("h-64") }
);

export const SalesShareWidget = dynamic(
  () => import("./widgets-impl").then((m) => m.SalesShareWidget),
  { ssr: false, loading: () => fallback("h-72") }
);

export const GroupSalesDynamicsWidget = dynamic(
  () => import("./widgets-impl").then((m) => m.GroupSalesDynamicsWidget),
  { ssr: false, loading: () => fallback("h-72") }
);
