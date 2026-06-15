-- NOTE: Prisma "Product_name_trgm_idx" (GIN trgm, perf_indexes'dan) ni schema'da
-- ifodalay olmaydi va DROP qilmoqchi bo'ladi — qidiruv indeksi kerak, DROP olib tashlandi.

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "packSize" SET DATA TYPE DECIMAL(20,3);

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "packCount" SET DATA TYPE DECIMAL(20,3),
ALTER COLUMN "packSize" SET DATA TYPE DECIMAL(20,3);
