-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('KUN_TAKLIFI', 'HAFTA_CHEGIRMA', 'BIZBOP_NARX', 'AAARZON', 'FLASH');

-- CreateEnum
CREATE TYPE "PromoStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MERCHANDISER';

-- NOTE: Prisma "Product_name_trgm_idx" (GIN trgm, perf_indexes'dan) ni schema'da
-- ifodalay olmaydi va DROP qilmoqchi bo'ladi — qidiruv indeksi kerak, DROP olib tashlandi.

-- CreateTable
CREATE TABLE "PromoCampaign" (
    "id" SERIAL NOT NULL,
    "type" "PromoType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PromoStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "branchId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoItem" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "regularPrice" DECIMAL(20,2) NOT NULL,
    "promoPrice" DECIMAL(20,2) NOT NULL,
    "promoLimit" DECIMAL(20,3),
    "priceReturned" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoCampaign_type_status_idx" ON "PromoCampaign"("type", "status");

-- CreateIndex
CREATE INDEX "PromoCampaign_startDate_endDate_idx" ON "PromoCampaign"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "PromoCampaign_branchId_idx" ON "PromoCampaign"("branchId");

-- CreateIndex
CREATE INDEX "PromoCampaign_createdById_idx" ON "PromoCampaign"("createdById");

-- CreateIndex
CREATE INDEX "PromoItem_productId_idx" ON "PromoItem"("productId");

-- CreateIndex
CREATE INDEX "PromoItem_campaignId_idx" ON "PromoItem"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoItem_campaignId_productId_key" ON "PromoItem"("campaignId", "productId");

-- AddForeignKey
ALTER TABLE "PromoCampaign" ADD CONSTRAINT "PromoCampaign_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCampaign" ADD CONSTRAINT "PromoCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoItem" ADD CONSTRAINT "PromoItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoItem" ADD CONSTRAINT "PromoItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
