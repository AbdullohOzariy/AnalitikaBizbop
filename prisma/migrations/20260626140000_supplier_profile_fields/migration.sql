-- Yetkazib beruvchi profil shartlari (umumiy) + filial bo'yicha profil (✓ maydonlar)
ALTER TABLE "Supplier" ADD COLUMN "paymentType" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "ehfMatch" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "otsrochkaDays" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN "debitorHas" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "debitorLimit" DECIMAL(18,2);
ALTER TABLE "Supplier" ADD COLUMN "discountPct" DECIMAL(6,2);
ALTER TABLE "Supplier" ADD COLUMN "marketingDiscount" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "retrobonusPct" DECIMAL(6,2);
ALTER TABLE "Supplier" ADD COLUMN "agentMerchNote" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "promoSystem" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "promoCalendar" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "responsibleRole" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "responsibleName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "responsiblePhone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "sverkaName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "sverkaPhone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "accountingName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "accountingPhone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "logisticsName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "logisticsPhone" TEXT;

CREATE TABLE "SupplierBranchProfile" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "shelfLengthCm" INTEGER,
    "faceCount" INTEGER,
    "skuCount" INTEGER,
    "orderDay" TEXT,
    "deliveryDays" INTEGER,
    "deliveryWeekday" TEXT,
    "deliveryTime" TEXT,
    "dpPaymentTerms" TEXT,
    "forecastYearly" DECIMAL(18,2),
    "forecastMonthly" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierBranchProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierBranchProfile_supplierId_branchId_key" ON "SupplierBranchProfile"("supplierId", "branchId");
CREATE INDEX "SupplierBranchProfile_branchId_idx" ON "SupplierBranchProfile"("branchId");
ALTER TABLE "SupplierBranchProfile" ADD CONSTRAINT "SupplierBranchProfile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierBranchProfile" ADD CONSTRAINT "SupplierBranchProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
