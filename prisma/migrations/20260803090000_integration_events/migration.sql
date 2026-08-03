-- CreateEnum
CREATE TYPE "IntegrationSource" AS ENUM ('ONEC');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" SERIAL NOT NULL,
    "source" "IntegrationSource" NOT NULL DEFAULT 'ONEC',
    "kind" TEXT NOT NULL,
    "externalId" TEXT,
    "externalNo" TEXT,
    "occurredAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_payloadHash_key" ON "IntegrationEvent"("payloadHash");

-- CreateIndex
CREATE INDEX "IntegrationEvent_status_receivedAt_idx" ON "IntegrationEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_kind_occurredAt_idx" ON "IntegrationEvent"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_externalId_idx" ON "IntegrationEvent"("externalId");

-- CreateIndex
CREATE INDEX "IntegrationEvent_batchId_idx" ON "IntegrationEvent"("batchId");
