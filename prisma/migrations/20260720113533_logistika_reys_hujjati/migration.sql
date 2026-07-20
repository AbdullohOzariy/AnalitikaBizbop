-- NOTE: Product_name_trgm_idx (GIN trgm, perf_indexes'dan) schema'da yo'q — DROP olib tashlandi.
-- NOTE: LogisticsPointAlias o'chirildi — tarixiy Excel importi qilinmaydi, alias kerak emas.
--       Jadval bo'sh edi (bir kun oldin yaratilgan, hech qachon to'ldirilmagan).

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('OPEN', 'DONE', 'DONE_LATE', 'FORCE_CLOSED', 'STALE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoadLevel" AS ENUM ('EMPTY', 'QUARTER', 'HALF', 'FULL');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('DRIVER', 'CONTROLLER', 'SYSTEM');

-- DropForeignKey
ALTER TABLE "LogisticsPointAlias" DROP CONSTRAINT "LogisticsPointAlias_pointId_fkey";

-- AlterTable
ALTER TABLE "LogisticsPoint" ADD COLUMN     "isLongHaul" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lat" DECIMAL(9,6),
ADD COLUMN     "lng" DECIMAL(9,6),
ADD COLUMN     "staleHours" INTEGER;

-- DropTable
DROP TABLE "LogisticsPointAlias";

-- CreateTable
CREATE TABLE "Driver" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tgUserId" BIGINT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" SERIAL NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'OPEN',
    "vehicleId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "tgChatId" TEXT,
    "tgMessageId" INTEGER,
    "actorKind" "ActorKind" NOT NULL DEFAULT 'DRIVER',
    "actorUserId" INTEGER,
    "actorName" TEXT NOT NULL,
    "impersonationReason" TEXT,
    "payAmount" DECIMAL(12,2),
    "clientEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLeg" (
    "id" SERIAL NOT NULL,
    "tripId" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "fromPointId" INTEGER NOT NULL,
    "toPointId" INTEGER NOT NULL,
    "departedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientDepartedAt" TIMESTAMP(3),
    "departLat" DECIMAL(9,6),
    "departLng" DECIMAL(9,6),
    "arrivedAt" TIMESTAMP(3),
    "clientArrivedAt" TIMESTAMP(3),
    "arriveLat" DECIMAL(9,6),
    "arriveLng" DECIMAL(9,6),
    "lateReport" BOOLEAN NOT NULL DEFAULT false,
    "load" "LoadLevel" NOT NULL,
    "loadEstimated" BOOLEAN NOT NULL DEFAULT false,
    "arrivedActorKind" "ActorKind",
    "arrivedActorUserId" INTEGER,
    "note" TEXT,
    "clientEventId" TEXT NOT NULL,

    CONSTRAINT "TripLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripRate" (
    "id" SERIAL NOT NULL,
    "fromPointId" INTEGER NOT NULL,
    "toPointId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "km" DECIMAL(6,2),
    "activeFrom" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_tgUserId_key" ON "Driver"("tgUserId");

-- CreateIndex
CREATE INDEX "Driver_isActive_idx" ON "Driver"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_clientEventId_key" ON "Trip"("clientEventId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_driverId_startedAt_idx" ON "Trip"("driverId", "startedAt");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_startedAt_idx" ON "Trip"("vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "Trip_startedAt_idx" ON "Trip"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripLeg_clientEventId_key" ON "TripLeg"("clientEventId");

-- CreateIndex
CREATE INDEX "TripLeg_tripId_seq_idx" ON "TripLeg"("tripId", "seq");

-- CreateIndex
CREATE INDEX "TripLeg_arrivedAt_idx" ON "TripLeg"("arrivedAt");

-- CreateIndex
CREATE INDEX "TripLeg_departedAt_idx" ON "TripLeg"("departedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripLeg_tripId_seq_key" ON "TripLeg"("tripId", "seq");

-- CreateIndex
CREATE INDEX "TripRate_isActive_idx" ON "TripRate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TripRate_fromPointId_toPointId_activeFrom_key" ON "TripRate"("fromPointId", "toPointId", "activeFrom");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_fromPointId_fkey" FOREIGN KEY ("fromPointId") REFERENCES "LogisticsPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_toPointId_fkey" FOREIGN KEY ("toPointId") REFERENCES "LogisticsPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRate" ADD CONSTRAINT "TripRate_fromPointId_fkey" FOREIGN KEY ("fromPointId") REFERENCES "LogisticsPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRate" ADD CONSTRAINT "TripRate_toPointId_fkey" FOREIGN KEY ("toPointId") REFERENCES "LogisticsPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- QULF INVARIANTI — QO'LDA YOZILGAN, PRISMA GENERATSIYA QILMAGAN.
--
-- Bular bo'lmasa "band mashinani ikkinchi haydovchi tanlay olmasin" talabi
-- BUZILADI: ikki haydovchi bir soniyada bir avtoni tanlab tugmani bossa,
-- ilova darajasidagi tekshiruv (SELECT keyin INSERT) ikkalasini ham o'tkazib
-- yuboradi (fantom o'qish). Partial unique indeks ikkinchi INSERT ni Postgres
-- darajasida bloklaydi va P2002 bilan rad etadi.
--
-- ⚠️ KEYINGI MIGRATSIYALARDA: `prisma migrate dev` bu indekslarni "ortiqcha"
-- deb DROP qilishi mumkin (schema.prisma da ifodalab bo'lmaydi). Har yangi
-- migratsiya SQL'ini tekshiring. instrumentation.ts da boot-assert bor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Bitta avtoda bir vaqtda faqat bitta ochiq reys
CREATE UNIQUE INDEX "Trip_open_per_vehicle_uniq" ON "Trip" ("vehicleId") WHERE ("status" = 'OPEN');

-- Bitta haydovchi bir vaqtda faqat bitta mashinada yo'lda bo'ladi
CREATE UNIQUE INDEX "Trip_open_per_driver_uniq" ON "Trip" ("driverId") WHERE ("status" = 'OPEN');

-- Reys ichida bir vaqtda faqat bitta ochiq plecho (yetib borilmagan)
CREATE UNIQUE INDEX "TripLeg_open_per_trip_uniq" ON "TripLeg" ("tripId") WHERE ("arrivedAt" IS NULL);
