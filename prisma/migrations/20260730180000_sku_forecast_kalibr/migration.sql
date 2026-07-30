-- Faza 3: kalibratsiya (BIAS tuzatish + empirik q90 kvantili) va servis iqtisodi.
-- Qo'lda yozilgan: `migrate diff --from-migrations` shadow DB talab qiladi,
-- `--from-config-datasource` esa LOKAL bazani o'qib, Neon'da allaqachon mavjud
-- jadvallarni qaytadan CREATE qilishni taklif qilardi.

-- AlterTable: yugurishda ishlatilgan kalibratsiya (provenance)
ALTER TABLE "SkuForecastRun" ADD COLUMN "biasK" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "SkuForecastRun" ADD COLUMN "servis" DOUBLE PRECISION NOT NULL DEFAULT 0.9;

-- AlterTable: q90 aniqlik qatorida ham saqlanadi (prognoz detali 12 haftada tozalanadi,
-- aniqlik 26 hafta yashaydi — servis darajasi tarixi detal bilan yo'qolmasin)
ALTER TABLE "SkuForecastAccuracy" ADD COLUMN "q90" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: servis iqtisodi kesim bo'yicha (qoplash + ortiqcha/kamomad dona)
ALTER TABLE "SkuForecastSegment" ADD COLUMN "qopladi" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SkuForecastSegment" ADD COLUMN "ortiqcha" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SkuForecastSegment" ADD COLUMN "kamomad" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SkuForecastCalib" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "sinf" VARCHAR(12) NOT NULL,
    "quantC" DOUBLE PRECISION NOT NULL,
    "n" INTEGER NOT NULL,
    "sovuq" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SkuForecastCalib_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkuForecastCalib_runId_sinf_key" ON "SkuForecastCalib"("runId", "sinf");

-- AddForeignKey
ALTER TABLE "SkuForecastCalib" ADD CONSTRAINT "SkuForecastCalib_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SkuForecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
