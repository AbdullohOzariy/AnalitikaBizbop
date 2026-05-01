"use client";

import dynamic from "next/dynamic";

const fallback = (h: string) => (
  <div className={`${h} flex items-center justify-center text-sm text-muted-foreground animate-pulse`}>
    Grafik yuklanmoqda...
  </div>
);

export const DailyDynamicsChart = dynamic(
  () => import("./charts-impl").then((m) => m.DailyDynamicsChart),
  { ssr: false, loading: () => fallback("h-72") }
);

export const BranchShareChart = dynamic(
  () => import("./charts-impl").then((m) => m.BranchShareChart),
  { ssr: false, loading: () => fallback("h-64") }
);

export const TopCategoriesChart = dynamic(
  () => import("./charts-impl").then((m) => m.TopCategoriesChart),
  { ssr: false, loading: () => fallback("h-72") }
);
