
-- CreateTable
CREATE TABLE "OnecIpLog" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnecIpLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnecIpLog_ip_key" ON "OnecIpLog"("ip");

-- CreateIndex
CREATE INDEX "OnecIpLog_allowed_lastSeen_idx" ON "OnecIpLog"("allowed", "lastSeen");
