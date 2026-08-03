
-- CreateTable
CREATE TABLE "CashDayClose" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "onDate" DATE NOT NULL,
    "expected" DECIMAL(20,2) NOT NULL,
    "counted" DECIMAL(20,2) NOT NULL,
    "diff" DECIMAL(20,2) NOT NULL,
    "note" TEXT,
    "closedById" INTEGER,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashDayClose_onDate_idx" ON "CashDayClose"("onDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashDayClose_accountId_onDate_key" ON "CashDayClose"("accountId", "onDate");

-- AddForeignKey
ALTER TABLE "CashDayClose" ADD CONSTRAINT "CashDayClose_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDayClose" ADD CONSTRAINT "CashDayClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
