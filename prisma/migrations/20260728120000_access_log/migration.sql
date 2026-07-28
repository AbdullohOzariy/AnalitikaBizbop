-- Tizim → Kirishlar: platforma va botlarga kirib-chiqishlar jurnali.
-- AccessEvent  = autentifikatsiya momenti (kirdi / kira olmadi / rad etildi).
-- AccessSession = faollik oynasi (30 daqiqa jimlikdan keyin yangisi ochiladi).
--
-- DIQQAT: `prisma migrate diff` chiqishida "DROP INDEX Product_name_trgm_idx"
-- ham bor edi — u QO'LDA yozilgan GIN trgm indeksi (20260607020000) va Prisma
-- uni "ortiqcha" deb hisoblaydi. ATAYLAB olib tashlandi.

-- CreateEnum
CREATE TYPE "AccessSurface" AS ENUM ('WEB', 'BOT_KIRISH', 'BOT_SPISANIYA', 'BOT_SVERKA', 'BOT_LOGISTIKA', 'BOT_SOTUV');

-- CreateEnum
CREATE TYPE "AccessEventType" AS ENUM ('LOGIN_OK', 'LOGIN_FAIL', 'DENIED', 'BLOCKED');

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" SERIAL NOT NULL,
    "surface" "AccessSurface" NOT NULL,
    "type" "AccessEventType" NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "userId" INTEGER,
    "tgUserId" BIGINT,
    "actorName" VARCHAR(120),
    "login" VARCHAR(120),
    "reason" VARCHAR(40),
    "route" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessSession" (
    "id" SERIAL NOT NULL,
    "surface" "AccessSurface" NOT NULL,
    "actorKey" VARCHAR(40) NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "userId" INTEGER,
    "tgUserId" BIGINT,
    "actorName" VARCHAR(120),
    "hits" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessEvent_dayKey_idx" ON "AccessEvent"("dayKey");

-- CreateIndex
CREATE INDEX "AccessEvent_createdAt_idx" ON "AccessEvent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccessEvent_surface_dayKey_idx" ON "AccessEvent"("surface", "dayKey");

-- CreateIndex
CREATE INDEX "AccessEvent_type_createdAt_idx" ON "AccessEvent"("type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccessEvent_userId_createdAt_idx" ON "AccessEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccessEvent_tgUserId_createdAt_idx" ON "AccessEvent"("tgUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccessSession_dayKey_idx" ON "AccessSession"("dayKey");

-- CreateIndex
CREATE INDEX "AccessSession_actorKey_surface_lastSeenAt_idx" ON "AccessSession"("actorKey", "surface", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "AccessSession_surface_dayKey_idx" ON "AccessSession"("surface", "dayKey");

-- CreateIndex
CREATE INDEX "AccessSession_lastSeenAt_idx" ON "AccessSession"("lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "AccessSession_userId_startedAt_idx" ON "AccessSession"("userId", "startedAt" DESC);

