

-- CreateTable
CREATE TABLE "SkuForecastRun" (
    "id" SERIAL NOT NULL,
    "weekStart" DATE NOT NULL,
    "horizon" INTEGER NOT NULL,
    "modelKey" VARCHAR(24) NOT NULL,
    "z" DOUBLE PRECISION NOT NULL,
    "panelWeeks" INTEGER NOT NULL,
    "seriesTotal" INTEGER NOT NULL,
    "forecasted" INTEGER NOT NULL,
    "skippedKam" INTEGER NOT NULL DEFAULT 0,
    "skippedArch" INTEGER NOT NULL DEFAULT 0,
    "scoredRows" INTEGER NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3),
    "status" VARCHAR(8) NOT NULL DEFAULT 'ok',
    "note" VARCHAR(300),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SkuForecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuForecast" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "sinf" VARCHAR(12) NOT NULL,
    "modelKey" VARCHAR(16) NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "q90" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "zeroProb" DOUBLE PRECISION,
    "lastQty" DOUBLE PRECISION NOT NULL,
    "trainWeeks" INTEGER NOT NULL,
    "nz" INTEGER NOT NULL,
    "adi" DOUBLE PRECISION,
    "cv2" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "targetFrom" DATE NOT NULL,
    "targetTo" DATE NOT NULL,

    CONSTRAINT "SkuForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuForecastAccuracy" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "sinf" VARCHAR(12) NOT NULL,
    "modelKey" VARCHAR(16) NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "forecast" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "absErr" DOUBLE PRECISION NOT NULL,
    "sqErr" DOUBLE PRECISION NOT NULL,
    "baseAbsErr" DOUBLE PRECISION NOT NULL,
    "baseSqErr" DOUBLE PRECISION NOT NULL,
    "amountWeight" DOUBLE PRECISION NOT NULL,
    "posWeeks" INTEGER NOT NULL,
    "stockout" BOOLEAN NOT NULL DEFAULT false,
    "targetTo" DATE NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuForecastAccuracy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuForecastSegment" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "horizon" INTEGER NOT NULL,
    "scope" VARCHAR(12) NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "label" VARCHAR(160),
    "seriya" INTEGER NOT NULL,
    "n" INTEGER NOT NULL,
    "posWeeks" INTEGER NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "forecast" DOUBLE PRECISION NOT NULL,
    "absErr" DOUBLE PRECISION NOT NULL,
    "sqErr" DOUBLE PRECISION NOT NULL,
    "baseAbsErr" DOUBLE PRECISION NOT NULL,
    "baseSqErr" DOUBLE PRECISION NOT NULL,
    "amountWeight" DOUBLE PRECISION NOT NULL,
    "ishonchli" INTEGER NOT NULL DEFAULT 0,
    "taxminiy" INTEGER NOT NULL DEFAULT 0,
    "ishonchsiz" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkuForecastSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkuForecastRun_scoredAt_idx" ON "SkuForecastRun"("scoredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SkuForecastRun_weekStart_horizon_modelKey_key" ON "SkuForecastRun"("weekStart", "horizon", "modelKey");

-- CreateIndex
CREATE INDEX "SkuForecast_productId_branchId_idx" ON "SkuForecast"("productId", "branchId");

-- CreateIndex
CREATE INDEX "SkuForecast_targetTo_idx" ON "SkuForecast"("targetTo");

-- CreateIndex
CREATE UNIQUE INDEX "SkuForecast_runId_productId_branchId_key" ON "SkuForecast"("runId", "productId", "branchId");

-- CreateIndex
CREATE INDEX "SkuForecastAccuracy_productId_branchId_targetTo_idx" ON "SkuForecastAccuracy"("productId", "branchId", "targetTo");

-- CreateIndex
CREATE INDEX "SkuForecastAccuracy_targetTo_idx" ON "SkuForecastAccuracy"("targetTo");

-- CreateIndex
CREATE UNIQUE INDEX "SkuForecastAccuracy_runId_productId_branchId_key" ON "SkuForecastAccuracy"("runId", "productId", "branchId");

-- CreateIndex
CREATE INDEX "SkuForecastSegment_scope_key_idx" ON "SkuForecastSegment"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SkuForecastSegment_runId_horizon_scope_key_key" ON "SkuForecastSegment"("runId", "horizon", "scope", "key");

-- AddForeignKey
ALTER TABLE "SkuForecast" ADD CONSTRAINT "SkuForecast_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SkuForecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuForecast" ADD CONSTRAINT "SkuForecast_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuForecast" ADD CONSTRAINT "SkuForecast_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuForecastAccuracy" ADD CONSTRAINT "SkuForecastAccuracy_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SkuForecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuForecastAccuracy" ADD CONSTRAINT "SkuForecastAccuracy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuForecastAccuracy" ADD CONSTRAINT "SkuForecastAccuracy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuForecastSegment" ADD CONSTRAINT "SkuForecastSegment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SkuForecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

