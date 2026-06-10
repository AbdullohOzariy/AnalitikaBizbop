-- No-aktiv SKU arxivi: buyurtma/monitoring ro'yxatlaridan chiqadi, sotuv tarixi saqlanadi
ALTER TABLE "Product" ADD COLUMN "archivedAt" TIMESTAMP(3);
