-- CreateEnum
CREATE TYPE "CashImportStatus" AS ENUM ('OK', 'FAILED');

-- CreateTable
CREATE TABLE "CashImportBatch" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "CashImportStatus" NOT NULL DEFAULT 'OK',
    "sourceSumIn" DECIMAL(20,2),
    "sourceSumOut" DECIMAL(20,2),
    "parsedSumIn" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "parsedSumOut" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsUnmatched" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmatchedCashRow" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "rawDesk" TEXT,
    "rawArticle" TEXT,
    "rawDate" TEXT,
    "rawPerson" TEXT,
    "rawNote" TEXT,
    "amountIn" DECIMAL(20,2),
    "amountOut" DECIMAL(20,2),
    "resolvedTxnId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "accountId" INTEGER,

    CONSTRAINT "UnmatchedCashRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashImportBatch_createdAt_idx" ON "CashImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "UnmatchedCashRow_batchId_idx" ON "UnmatchedCashRow"("batchId");

-- CreateIndex
CREATE INDEX "UnmatchedCashRow_reason_resolvedAt_idx" ON "UnmatchedCashRow"("reason", "resolvedAt");

-- AddForeignKey
ALTER TABLE "CashImportBatch" ADD CONSTRAINT "CashImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmatchedCashRow" ADD CONSTRAINT "UnmatchedCashRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CashImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmatchedCashRow" ADD CONSTRAINT "UnmatchedCashRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
