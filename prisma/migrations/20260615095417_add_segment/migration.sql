-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('PREMIUM', 'MEDIUM', 'EASY');

-- NOTE: Prisma "Product_name_trgm_idx" (GIN trgm, perf_indexes'dan) ni schema'da
-- ifodalay olmaydi va DROP qilmoqchi bo'ladi — qidiruv indeksi kerak, DROP olib tashlandi.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "segment" "Segment";

-- CreateIndex
CREATE INDEX "Product_segment_idx" ON "Product"("segment");
