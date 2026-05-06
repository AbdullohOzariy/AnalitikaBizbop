-- CreateIndex
CREATE INDEX "DailyMetrics_branchId_date_idx" ON "DailyMetrics"("branchId", "date");

-- CreateIndex
CREATE INDEX "DailyPlan_branchId_categoryId_date_idx" ON "DailyPlan"("branchId", "categoryId", "date");

-- CreateIndex
CREATE INDEX "DailyVisits_branchId_date_idx" ON "DailyVisits"("branchId", "date");

-- CreateIndex
CREATE INDEX "MonthlyPlan_branchId_year_month_idx" ON "MonthlyPlan"("branchId", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyPlan_categoryId_year_month_idx" ON "MonthlyPlan"("categoryId", "year", "month");
