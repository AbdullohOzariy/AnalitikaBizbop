-- Performance indexes for analytics aggregation queries.

CREATE INDEX IF NOT EXISTS "CategorySales_branchId_periodStart_periodEnd_idx"
  ON "CategorySales" ("branchId", "periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "CategorySales_categoryId_periodStart_periodEnd_idx"
  ON "CategorySales" ("categoryId", "periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "MonthlyPlan_year_month_idx"
  ON "MonthlyPlan" ("year", "month");
