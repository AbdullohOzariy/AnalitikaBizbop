-- Kontragent o'rniga "Qabul qildi" (qabul qiluvchi xodim) + ismlar ro'yxati
ALTER TABLE "SverkaRecord" RENAME COLUMN "kontragent" TO "qabulQildi";

CREATE TABLE "SverkaQabulchi" (
    "id" SERIAL NOT NULL,
    "ism" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SverkaQabulchi_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SverkaQabulchi_ism_key" ON "SverkaQabulchi"("ism");
