-- CreateTable
CREATE TABLE "CronRun" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CronRun_job_dayKey_key" ON "CronRun"("job", "dayKey");

