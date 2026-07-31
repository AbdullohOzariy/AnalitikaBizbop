-- Kvantil kalibratsiyasi sinf×ABC kesimiga o'tdi. Sabab o'lchangan: faqat sinf
-- bo'yicha kalibrlanganda servis darajasi ABC bo'ylab tengsiz taqsimlanadi —
-- A 79.0% · B 87.3% · C 95.2% (tarqoqlik 16.2 pp), ya'ni eng ko'p sotiladigan
-- tovarlar eng kam qoplanadi. sinf×ABC bilan: A 90.6% · B 90.4% · C 90.9% (0.5 pp).

-- AlterTable
ALTER TABLE "SkuForecastCalib" ADD COLUMN "abc" VARCHAR(2) NOT NULL DEFAULT '*';

-- DropIndex + CreateIndex: noyob kalitga abc qo'shildi
DROP INDEX "SkuForecastCalib_runId_sinf_key";
CREATE UNIQUE INDEX "SkuForecastCalib_runId_sinf_abc_key" ON "SkuForecastCalib"("runId", "sinf", "abc");
