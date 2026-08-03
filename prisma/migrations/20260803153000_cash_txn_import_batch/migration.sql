
-- AlterTable
ALTER TABLE "CashTxn" ADD COLUMN     "importBatchId" INTEGER;

-- CreateIndex
CREATE INDEX "CashTxn_importBatchId_idx" ON "CashTxn"("importBatchId");

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "CashImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
