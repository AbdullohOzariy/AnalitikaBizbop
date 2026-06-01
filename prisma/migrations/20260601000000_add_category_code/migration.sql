-- 1C KOD: kategoriya/guruh identifikatori va matching kaliti.
-- Nom endi unique emas (1C'da bir xil nom turli joyda) — farqlash code orqali.

-- Drop old unique on Category.name
DROP INDEX IF EXISTS "Category_name_key";

-- Add code columns
ALTER TABLE "Category" ADD COLUMN "code" INTEGER;
ALTER TABLE "CategoryGroup" ADD COLUMN "code" INTEGER;

-- Unique indexes on code
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");
CREATE UNIQUE INDEX "CategoryGroup_code_key" ON "CategoryGroup"("code");
