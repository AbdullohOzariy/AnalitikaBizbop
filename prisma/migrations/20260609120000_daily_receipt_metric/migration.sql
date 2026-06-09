-- Kunlik chek metrikalari (qo'lda kiritiladi) — filial × sana
CREATE TABLE "DailyReceiptMetric" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "receiptCount" INTEGER NOT NULL DEFAULT 0,
    "itemsPerReceipt" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyReceiptMetric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyReceiptMetric_branchId_date_key" ON "DailyReceiptMetric"("branchId", "date");
CREATE INDEX "DailyReceiptMetric_date_idx" ON "DailyReceiptMetric"("date");
ALTER TABLE "DailyReceiptMetric" ADD CONSTRAINT "DailyReceiptMetric_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
