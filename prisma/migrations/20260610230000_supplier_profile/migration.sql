-- Ta'minotchi profili: baho, kontakt, zakaz kunlari; shartnomalar; SKU lead time
ALTER TABLE "Supplier" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN "ratingNote" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "phone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "orderWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "Product" ADD COLUMN "leadTimeDays" INTEGER;

CREATE TABLE "SupplierContract" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "number" TEXT,
    "signedAt" DATE,
    "endDate" DATE,
    "amount" DECIMAL(20,2),
    "url" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierContract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierContract_supplierId_idx" ON "SupplierContract"("supplierId");

ALTER TABLE "SupplierContract" ADD CONSTRAINT "SupplierContract_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
