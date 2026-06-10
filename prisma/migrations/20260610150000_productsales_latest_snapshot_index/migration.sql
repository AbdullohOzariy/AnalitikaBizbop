-- OOS/Stockday "eng so'nggi snapshot" (DISTINCT ON productId, branchId ORDER BY periodEnd DESC)
-- so'rovlari uchun tartibga mos indeks
CREATE INDEX IF NOT EXISTS "ProductSales_productId_branchId_periodEnd_idx"
  ON "ProductSales"("productId", "branchId", "periodEnd" DESC);
