-- Chiqim (hisobdan chiqarish) rejasi — subkategoriya × filial, vaqtsiz.
-- pct = chiqimning savdoga nisbatan ruxsat etilgan ulushi, foizda (1.250 = 1.25%).
-- CreateTable
CREATE TABLE "WriteoffPlan" (
  "id"         SERIAL       NOT NULL,
  "branchId"   INTEGER      NOT NULL,
  "categoryId" INTEGER      NOT NULL,
  "pct"        DECIMAL(6,3) NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WriteoffPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WriteoffPlan_branchId_categoryId_key"
  ON "WriteoffPlan"("branchId", "categoryId");

-- CreateIndex
CREATE INDEX "WriteoffPlan_branchId_idx" ON "WriteoffPlan"("branchId");

-- CreateIndex
CREATE INDEX "WriteoffPlan_categoryId_idx" ON "WriteoffPlan"("categoryId");

-- AddForeignKey
ALTER TABLE "WriteoffPlan"
  ADD CONSTRAINT "WriteoffPlan_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WriteoffPlan"
  ADD CONSTRAINT "WriteoffPlan_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
