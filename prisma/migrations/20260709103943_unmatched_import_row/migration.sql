-- NOTE: Product_name_trgm_idx (GIN trgm, perf_indexes'dan) schema'da yo'q — DROP olib tashlandi.

-- CreateTable
CREATE TABLE "UnmatchedImportRow" (
    "id" SERIAL NOT NULL,
    "uploadedFileId" INTEGER,
    "day" DATE NOT NULL,
    "branchAlias" TEXT NOT NULL,
    "warehouseCode" TEXT,
    "name" TEXT NOT NULL,
    "artikul" TEXT,
    "stockQty" DECIMAL(20,3),
    "soldQty" DECIMAL(20,3),
    "salePrice" DECIMAL(20,3),
    "costPrice" DECIMAL(20,3),
    "amount" DECIMAL(20,2),
    "costAmount" DECIMAL(20,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmatchedImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnmatchedImportRow_day_idx" ON "UnmatchedImportRow"("day");

-- CreateIndex
CREATE INDEX "UnmatchedImportRow_uploadedFileId_idx" ON "UnmatchedImportRow"("uploadedFileId");

-- AddForeignKey
ALTER TABLE "UnmatchedImportRow" ADD CONSTRAINT "UnmatchedImportRow_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
