-- Joriy holat denormalizatsiyasi: Product'ga so'nggi davr qoldiq/sotuv.
ALTER TABLE "Product" ADD COLUMN "currentStock" DECIMAL(20,3);
ALTER TABLE "Product" ADD COLUMN "currentSold" DECIMAL(20,3);
ALTER TABLE "Product" ADD COLUMN "lastSalePeriod" DATE;

-- Backfill: mavjud mahsulotlar uchun so'nggi davrdan (filiallar yig'indisi) to'ldiramiz.
UPDATE "Product" p SET
  "currentStock"   = agg.stock,
  "currentSold"    = agg.sold,
  "lastSalePeriod" = agg.period
FROM (
  SELECT ps."productId",
         SUM(ps."stockQty") AS stock,
         SUM(ps."soldQty")  AS sold,
         latest.period
  FROM "ProductSales" ps
  JOIN (
    SELECT "productId", MAX("periodEnd") AS period
    FROM "ProductSales"
    GROUP BY "productId"
  ) latest ON latest."productId" = ps."productId" AND ps."periodEnd" = latest.period
  GROUP BY ps."productId", latest.period
) agg
WHERE p.id = agg."productId";
