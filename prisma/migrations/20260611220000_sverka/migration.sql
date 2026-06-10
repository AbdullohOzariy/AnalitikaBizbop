-- Sverka: yetkazib beruvchi bilan solishtirish yozuvlari (Telegram Mini App)
CREATE TABLE "SverkaRecord" (
    "id" SERIAL NOT NULL,
    "sana" DATE NOT NULL,
    "supplierId" INTEGER,
    "firmaNomi" TEXT NOT NULL,
    "sklad" TEXT NOT NULL,
    "kontragent" TEXT NOT NULL,
    "dagavor" TEXT NOT NULL,
    "summa" DECIMAL(20,2) NOT NULL,
    "rasmFileId" TEXT NOT NULL,
    "tgUserId" BIGINT NOT NULL,
    "tgUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SverkaRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SverkaRecord_sana_idx" ON "SverkaRecord"("sana");
CREATE INDEX "SverkaRecord_supplierId_idx" ON "SverkaRecord"("supplierId");
CREATE INDEX "SverkaRecord_createdAt_idx" ON "SverkaRecord"("createdAt");
ALTER TABLE "SverkaRecord" ADD CONSTRAINT "SverkaRecord_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
