-- AlterEnum
ALTER TYPE "AliasSource" ADD VALUE 'PLANS';

-- AlterEnum
ALTER TYPE "FileType" ADD VALUE 'DAILY_PLANS';

-- CreateTable
CREATE TABLE "CategoryAlias" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "CategoryAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" SERIAL NOT NULL,
    "uploadedFileId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "planAmount" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryAlias_categoryId_idx" ON "CategoryAlias"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAlias_alias_key" ON "CategoryAlias"("alias");

-- CreateIndex
CREATE INDEX "DailyPlan_date_idx" ON "DailyPlan"("date");

-- CreateIndex
CREATE INDEX "DailyPlan_branchId_date_idx" ON "DailyPlan"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_branchId_categoryId_date_key" ON "DailyPlan"("branchId", "categoryId", "date");

-- AddForeignKey
ALTER TABLE "CategoryAlias" ADD CONSTRAINT "CategoryAlias_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
