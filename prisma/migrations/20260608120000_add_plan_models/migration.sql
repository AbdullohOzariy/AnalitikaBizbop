-- SalesPlan: oylik sotuv rejasi (subkategoriya × filial × yil/oy)
CREATE TABLE "SalesPlan" (
  "id"         SERIAL         NOT NULL,
  "branchId"   INTEGER        NOT NULL,
  "categoryId" INTEGER        NOT NULL,
  "year"       INTEGER        NOT NULL,
  "month"      INTEGER        NOT NULL,
  "amount"     DECIMAL(18,2)  NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3)   NOT NULL,

  CONSTRAINT "SalesPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPlan_branchId_categoryId_year_month_key"
  ON "SalesPlan"("branchId", "categoryId", "year", "month");

CREATE INDEX "SalesPlan_branchId_year_month_idx"
  ON "SalesPlan"("branchId", "year", "month");

ALTER TABLE "SalesPlan"
  ADD CONSTRAINT "SalesPlan_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesPlan"
  ADD CONSTRAINT "SalesPlan_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MarginPlan: marja rejasi (subkategoriya × filial, vaqtsiz)
CREATE TABLE "MarginPlan" (
  "id"         SERIAL        NOT NULL,
  "branchId"   INTEGER       NOT NULL,
  "categoryId" INTEGER       NOT NULL,
  "marginPct"  DECIMAL(6,2)  NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "MarginPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarginPlan_branchId_categoryId_key"
  ON "MarginPlan"("branchId", "categoryId");

CREATE INDEX "MarginPlan_branchId_idx"
  ON "MarginPlan"("branchId");

ALTER TABLE "MarginPlan"
  ADD CONSTRAINT "MarginPlan_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarginPlan"
  ADD CONSTRAINT "MarginPlan_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
