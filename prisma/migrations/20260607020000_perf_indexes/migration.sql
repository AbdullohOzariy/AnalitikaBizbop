-- Performans indekslari: scope filtri (Category) + SKU nom qidiruvi (ILIKE).

-- CreateIndex (Category.parentId / groupId — scope filtrlari uchun)
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
CREATE INDEX "Category_groupId_idx" ON "Category"("groupId");

-- Product.name ILIKE '%q%' qidiruvi uchun trigram GIN indeks (25k+ qatorда seq-scan'ni yopadi).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);
