-- ForecastDay: kunlik prognoz summasi (tahrirlanadigan) — filial × oy × kun
CREATE TABLE "ForecastDay" (
  "id"       SERIAL        NOT NULL,
  "branchId" INTEGER       NOT NULL,
  "year"     INTEGER       NOT NULL,
  "month"    INTEGER       NOT NULL,
  "date"     DATE          NOT NULL,
  "amount"   DECIMAL(18,2) NOT NULL,
  "locked"   BOOLEAN       NOT NULL DEFAULT false,

  CONSTRAINT "ForecastDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastDay_branchId_year_month_date_key"
  ON "ForecastDay"("branchId", "year", "month", "date");
CREATE INDEX "ForecastDay_date_idx" ON "ForecastDay"("date");
CREATE INDEX "ForecastDay_branchId_year_month_idx"
  ON "ForecastDay"("branchId", "year", "month");

ALTER TABLE "ForecastDay"
  ADD CONSTRAINT "ForecastDay_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
