-- CreateTable
CREATE TABLE "PromoItemGroup" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoItemGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoItemGroup_campaignId_idx" ON "PromoItemGroup"("campaignId");

-- AlterTable
ALTER TABLE "PromoItem" ADD COLUMN "groupId" INTEGER;

-- CreateIndex
CREATE INDEX "PromoItem_groupId_idx" ON "PromoItem"("groupId");

-- AddForeignKey
ALTER TABLE "PromoItemGroup" ADD CONSTRAINT "PromoItemGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoItem" ADD CONSTRAINT "PromoItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PromoItemGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
