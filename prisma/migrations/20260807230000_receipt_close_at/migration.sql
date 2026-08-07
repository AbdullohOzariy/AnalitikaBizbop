-- Chek yopilgan payt — fiskal havoladagi `c=YYYYMMDDHHMMSS` dan olinadi.
-- 1C ning `closeDate` maydoni har doim bo'sh keladi.
--
-- ⚠️ Prisma diff bu yerga `DROP INDEX "Product_name_trgm_idx"` ham qo'shadi —
-- ATAYLAB olib tashlangan (trigram indeks xom SQL bilan yaratilgan).
ALTER TABLE "Receipt" ADD COLUMN "closeAt" TIMESTAMP(3);
