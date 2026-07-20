-- NOTE: Product_name_trgm_idx (GIN trgm, perf_indexes'dan) schema'da yo'q — DROP olib tashlandi.

-- CreateEnum
CREATE TYPE "PointKind" AS ENUM ('WAREHOUSE', 'BRANCH', 'CITY', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'LOGIST';
ALTER TYPE "Role" ADD VALUE 'DRIVER';

-- CreateTable
CREATE TABLE "LogisticsPoint" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PointKind" NOT NULL DEFAULT 'OTHER',
    "branchId" INTEGER,
    "isHub" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsPointAlias" (
    "id" SERIAL NOT NULL,
    "pointId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "LogisticsPointAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" SERIAL NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "capacityM3" DECIMAL(6,2),
    "capacityVagonetka" DECIMAL(6,2),
    "insuranceUntil" DATE,
    "techInspectionUntil" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsPoint_name_key" ON "LogisticsPoint"("name");

-- CreateIndex
CREATE INDEX "LogisticsPoint_isActive_sortOrder_idx" ON "LogisticsPoint"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "LogisticsPoint_branchId_idx" ON "LogisticsPoint"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsPointAlias_alias_key" ON "LogisticsPointAlias"("alias");

-- CreateIndex
CREATE INDEX "LogisticsPointAlias_pointId_idx" ON "LogisticsPointAlias"("pointId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNumber_key" ON "Vehicle"("plateNumber");

-- CreateIndex
CREATE INDEX "Vehicle_isActive_idx" ON "Vehicle"("isActive");

-- AddForeignKey
ALTER TABLE "LogisticsPoint" ADD CONSTRAINT "LogisticsPoint_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsPointAlias" ADD CONSTRAINT "LogisticsPointAlias_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "LogisticsPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
