-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('SALES', 'METRICS', 'VISITS');

-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('SALES', 'VISITS', 'SR');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchAlias" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,
    "source" "AliasSource" NOT NULL,

    CONSTRAINT "BranchAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorySales" (
    "id" SERIAL NOT NULL,
    "uploadedFileId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "CategorySales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetrics" (
    "id" SERIAL NOT NULL,
    "uploadedFileId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "receiptCount" INTEGER NOT NULL,
    "receiptTotal" DECIMAL(20,2) NOT NULL,
    "avgItemsPerReceipt" DECIMAL(10,4) NOT NULL,
    "avgReceipt" DECIMAL(20,2) NOT NULL,
    "bigPurchaseLevel" DECIMAL(20,2) NOT NULL,
    "smallPurchaseLevel" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyVisits" (
    "id" SERIAL NOT NULL,
    "uploadedFileId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "visitCount" INTEGER NOT NULL,

    CONSTRAINT "DailyVisits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPlan" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "planAmount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "branchId" INTEGER,
    "periodStart" DATE,
    "periodEnd" DATE,
    "yearOverride" INTEGER,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE INDEX "BranchAlias_branchId_idx" ON "BranchAlias"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchAlias_alias_source_key" ON "BranchAlias"("alias", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "CategorySales_periodStart_periodEnd_idx" ON "CategorySales"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CategorySales_branchId_categoryId_periodStart_periodEnd_key" ON "CategorySales"("branchId", "categoryId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "DailyMetrics_date_idx" ON "DailyMetrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetrics_branchId_date_key" ON "DailyMetrics"("branchId", "date");

-- CreateIndex
CREATE INDEX "DailyVisits_date_idx" ON "DailyVisits"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyVisits_branchId_date_key" ON "DailyVisits"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlan_branchId_year_month_categoryId_key" ON "MonthlyPlan"("branchId", "year", "month", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_fileHash_key" ON "UploadedFile"("fileHash");

-- CreateIndex
CREATE INDEX "UploadedFile_fileType_periodStart_periodEnd_idx" ON "UploadedFile"("fileType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "UploadedFile_uploadedById_idx" ON "UploadedFile"("uploadedById");

-- AddForeignKey
ALTER TABLE "BranchAlias" ADD CONSTRAINT "BranchAlias_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySales" ADD CONSTRAINT "CategorySales_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySales" ADD CONSTRAINT "CategorySales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorySales" ADD CONSTRAINT "CategorySales_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetrics" ADD CONSTRAINT "DailyMetrics_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetrics" ADD CONSTRAINT "DailyMetrics_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyVisits" ADD CONSTRAINT "DailyVisits_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyVisits" ADD CONSTRAINT "DailyVisits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
