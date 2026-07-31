-- Faza 3.1: kvantil kaliti `sinf×ABC` dan `ABC × p50 bandi` ga o'tdi.
-- O'lchov: sinf×abc kalitida qoplash p50 kattaligi bo'ylab monoton pasayardi —
-- 3–10 bandda 93.1%, 300–1k da 87.0%, 1k+ da atigi 76.1% (kamomad 344 dona/oyna).
-- abc×band bilan: JAMI 91.2% · A 89.9% (oldin 85.1%) · 1k+ 89.8% (kamomad 217).
--
-- Kalit endi erkin matn: kesim sxemasi o'lchovga qarab o'zgaradi, provenance
-- jadvali uchun har safar migratsiya yozish ortiqcha. Eski qatorlar tashlanadi —
-- ular har yugurishda qaytadan yoziladi.
--
-- HAMMA QADAM IDEMPOTENT (IF EXISTS / IF NOT EXISTS). Sabab: `migrate deploy` bu
-- migratsiyani BITTA tranzaksiyada bajarmadi — birinchi urinish oxirgi qadamda
-- yiqilganda oldingi qadamlar bazada QOLIB KETDI va qayta yurgizish "column does
-- not exist" bilan yana yiqildi. Idempotent yozilsa har qanday oraliq holatdan
-- yakunlanadi.

DELETE FROM "SkuForecastCalib";

-- Indeks AVVAL tashlanadi: ustun tashlansa indeks ham birga ketadi va keyingi
-- DROP INDEX "does not exist" bilan yiqilardi.
DROP INDEX IF EXISTS "SkuForecastCalib_runId_sinf_abc_key";

ALTER TABLE "SkuForecastCalib" DROP COLUMN IF EXISTS "sinf";
ALTER TABLE "SkuForecastCalib" DROP COLUMN IF EXISTS "abc";
-- NOT NULL default'siz: jadval yuqorida bo'shatilgani uchun xavfsiz.
ALTER TABLE "SkuForecastCalib" ADD COLUMN IF NOT EXISTS "kalit" VARCHAR(32) NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SkuForecastCalib_runId_kalit_key" ON "SkuForecastCalib"("runId", "kalit");
