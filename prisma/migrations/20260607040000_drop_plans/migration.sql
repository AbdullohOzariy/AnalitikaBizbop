-- Reja (plan) funksiyasini to'liq olib tashlash:
--   MonthlyPlan ("Normal Reja") + DailyPlan (kunlik reja yuklash) jadvallari,
--   ularning UploadedFile audit yozuvlari, filial reja aliaslari va
--   FileType.DAILY_PLANS enum qiymati.

-- 1. Reja jadvallarini drop qilish (FK'lar shu bilan ketadi)
DROP TABLE IF EXISTS "DailyPlan";
DROP TABLE IF EXISTS "MonthlyPlan";

-- 2. Kunlik reja fayllarining audit yozuvlari (enum qiymatini olib tashlashdan oldin)
DELETE FROM "UploadedFile" WHERE "fileType" = 'DAILY_PLANS';

-- 3. Reja manbali filial aliaslari (endi ishlatilmaydi)
DELETE FROM "BranchAlias" WHERE "source" = 'PLANS';

-- 4. FileType enum'dan DAILY_PLANS qiymatini olib tashlash
--    (Postgres'da enum qiymatini to'g'ridan-to'g'ri o'chirib bo'lmaydi —
--     yangi tur yaratib, ustunni ko'chirib, eskisini drop qilamiz)
ALTER TYPE "FileType" RENAME TO "FileType_old";
CREATE TYPE "FileType" AS ENUM ('SALES', 'METRICS', 'VISITS');
ALTER TABLE "UploadedFile"
  ALTER COLUMN "fileType" TYPE "FileType" USING ("fileType"::text::"FileType");
DROP TYPE "FileType_old";
