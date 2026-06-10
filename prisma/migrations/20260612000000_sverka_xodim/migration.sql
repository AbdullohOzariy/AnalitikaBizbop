-- Sverka boti ruxsat ro'yxati
CREATE TABLE "SverkaXodim" (
    "id" SERIAL NOT NULL,
    "tgUserId" BIGINT NOT NULL,
    "ism" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SverkaXodim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SverkaXodim_tgUserId_key" ON "SverkaXodim"("tgUserId");
