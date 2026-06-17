-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- NOTE: Prisma "Product_name_trgm_idx" (GIN trgm, perf_indexes'dan) ni schema'da
-- ifodalay olmaydi va DROP qilmoqchi bo'ladi — qidiruv indeksi kerak, DROP olib tashlandi.

-- CreateTable
CREATE TABLE "Distribution" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'DRAFT',
    "targetDays" INTEGER NOT NULL DEFAULT 7,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionItem" (
    "id" SERIAL NOT NULL,
    "distributionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" DECIMAL(20,3) NOT NULL,

    CONSTRAINT "DistributionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Distribution_branchId_idx" ON "Distribution"("branchId");

-- CreateIndex
CREATE INDEX "Distribution_status_idx" ON "Distribution"("status");

-- CreateIndex
CREATE INDEX "DistributionItem_productId_idx" ON "DistributionItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionItem_distributionId_productId_key" ON "DistributionItem"("distributionId", "productId");

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
