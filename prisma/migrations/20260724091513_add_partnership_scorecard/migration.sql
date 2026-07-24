-- CreateTable
CREATE TABLE "PartnershipScorecard" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "promoCompPct" DECIMAL(6,2),
    "rassrochkaPct" DECIMAL(6,2),
    "bonusPct" DECIMAL(6,2),
    "spisaniyePct" DECIMAL(6,2),
    "abcOverride" VARCHAR(4),
    "note" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnershipScorecard_supplierId_idx" ON "PartnershipScorecard"("supplierId");

-- CreateIndex
CREATE INDEX "PartnershipScorecard_periodStart_periodEnd_idx" ON "PartnershipScorecard"("periodStart", "periodEnd");

-- CreateIndex
-- Unikal: har (supplierId, agentId, periodStart, periodEnd) uchun BITTA yozuv.
-- agentId NULL (ta'minotchi-darajasi) qatorlar ham dublikat deb qaralishi uchun NULLS NOT DISTINCT
-- kerak — bu PG 15+ (Neon prod) xususiyati. Lokal dev PG 14 uni qo'llab-quvvatlamaydi, shu bois
-- server versiyasiga qarab shartli yaratamiz. Index NOMI ikkala holatda ham bir xil bo'lib,
-- Prisma @@unique kutgani bilan mos keladi (drift bo'lmaydi).
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'CREATE UNIQUE INDEX "PartnershipScorecard_supplierId_agentId_periodStart_periodE_key" ON "PartnershipScorecard"("supplierId", "agentId", "periodStart", "periodEnd") NULLS NOT DISTINCT';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX "PartnershipScorecard_supplierId_agentId_periodStart_periodE_key" ON "PartnershipScorecard"("supplierId", "agentId", "periodStart", "periodEnd")';
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "PartnershipScorecard" ADD CONSTRAINT "PartnershipScorecard_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipScorecard" ADD CONSTRAINT "PartnershipScorecard_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipScorecard" ADD CONSTRAINT "PartnershipScorecard_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
