-- ForecastCurve: kunlik og'irlik (taqsimot shakli) — filial × bo'lim × oy × kun
CREATE TABLE "ForecastCurve" (
  "id"       SERIAL        NOT NULL,
  "branchId" INTEGER       NOT NULL,
  "groupId"  INTEGER       NOT NULL,
  "year"     INTEGER       NOT NULL,
  "month"    INTEGER       NOT NULL,
  "date"     DATE          NOT NULL,
  "weight"   DECIMAL(9,8)  NOT NULL,

  CONSTRAINT "ForecastCurve_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastCurve_branchId_groupId_year_month_date_key"
  ON "ForecastCurve"("branchId", "groupId", "year", "month", "date");
CREATE INDEX "ForecastCurve_branchId_year_month_idx"
  ON "ForecastCurve"("branchId", "year", "month");
CREATE INDEX "ForecastCurve_date_idx" ON "ForecastCurve"("date");

ALTER TABLE "ForecastCurve"
  ADD CONSTRAINT "ForecastCurve_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForecastCurve"
  ADD CONSTRAINT "ForecastCurve_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CategoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ForecastRun: AI izohi va meta — filial × bo'lim × oy
CREATE TABLE "ForecastRun" (
  "id"        SERIAL        NOT NULL,
  "branchId"  INTEGER       NOT NULL,
  "groupId"   INTEGER       NOT NULL,
  "year"      INTEGER       NOT NULL,
  "month"     INTEGER       NOT NULL,
  "model"     TEXT          NOT NULL,
  "rationale" TEXT          NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ForecastRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastRun_branchId_groupId_year_month_key"
  ON "ForecastRun"("branchId", "groupId", "year", "month");
CREATE INDEX "ForecastRun_branchId_year_month_idx"
  ON "ForecastRun"("branchId", "year", "month");

ALTER TABLE "ForecastRun"
  ADD CONSTRAINT "ForecastRun_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForecastRun"
  ADD CONSTRAINT "ForecastRun_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CategoryGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
