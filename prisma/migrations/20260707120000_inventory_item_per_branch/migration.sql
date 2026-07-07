-- Ro'yxat filial kesimiga o'tadi: mavjud yozuvlar (global, avto-OOS) tozalanadi —
-- deploy'dan keyin "OOS'dan avto to'ldirish" qayta bosiladi (endi filial-aware).
TRUNCATE "InventoryItem";

-- DropIndex
DROP INDEX "InventoryItem_productId_key";

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "branchId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "InventoryItem_branchId_idx" ON "InventoryItem"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_productId_branchId_key" ON "InventoryItem"("productId", "branchId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

