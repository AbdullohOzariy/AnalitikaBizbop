-- CreateIndex
CREATE INDEX "CategorySales_periodEnd_periodStart_idx" ON "CategorySales"("periodEnd", "periodStart");

-- CreateIndex
CREATE INDEX "ProductSales_periodEnd_periodStart_idx" ON "ProductSales"("periodEnd", "periodStart");

