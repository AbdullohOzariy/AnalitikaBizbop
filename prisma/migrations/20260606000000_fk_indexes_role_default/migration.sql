-- UploadedFile o'chirilganda Cascade DELETE tezlashishi uchun FK ustunlariga indeks.
-- (Avval bu ustunlarda indeks yo'q edi — har fayl o'chirishda full-table scan bo'lardi.)

-- CreateIndex
CREATE INDEX "CategorySales_uploadedFileId_idx" ON "CategorySales"("uploadedFileId");

-- CreateIndex
CREATE INDEX "DailyMetrics_uploadedFileId_idx" ON "DailyMetrics"("uploadedFileId");

-- CreateIndex
CREATE INDEX "DailyVisits_uploadedFileId_idx" ON "DailyVisits"("uploadedFileId");

-- CreateIndex
CREATE INDEX "DailyPlan_uploadedFileId_idx" ON "DailyPlan"("uploadedFileId");

-- CreateIndex
CREATE INDEX "ProductSales_uploadedFileId_idx" ON "ProductSales"("uploadedFileId");

-- Yangi foydalanuvchi default roli: eskirgan VIEWER o'rniga CAT_MANAGER.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CAT_MANAGER';
