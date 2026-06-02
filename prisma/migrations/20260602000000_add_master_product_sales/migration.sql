-- Master baza: mahsulot (SKU) darajasidagi sotuv ma'lumoti (yangi ShablonSotuv.xlsx)

-- AlterTable
ALTER TABLE "UploadedFile" ADD COLUMN "templateVersion" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSales" (
    "id" SERIAL NOT NULL,
    "uploadedFileId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "stockQty" DECIMAL(20,3),
    "soldQty" DECIMAL(20,3),
    "amount" DECIMAL(20,2) NOT NULL,
    "costAmount" DECIMAL(20,2),
    CONSTRAINT "ProductSales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "ProductSales_periodStart_periodEnd_idx" ON "ProductSales"("periodStart", "periodEnd");
CREATE INDEX "ProductSales_branchId_periodStart_periodEnd_idx" ON "ProductSales"("branchId", "periodStart", "periodEnd");
CREATE INDEX "ProductSales_productId_periodStart_periodEnd_idx" ON "ProductSales"("productId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "ProductSales_productId_branchId_periodStart_periodEnd_key" ON "ProductSales"("productId", "branchId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductSales" ADD CONSTRAINT "ProductSales_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSales" ADD CONSTRAINT "ProductSales_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSales" ADD CONSTRAINT "ProductSales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
