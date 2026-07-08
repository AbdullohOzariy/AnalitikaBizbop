-- AlterTable
ALTER TABLE "PromoItem" ALTER COLUMN "imageZoom" SET DEFAULT 1,
ALTER COLUMN "imageZoom" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PromoItemGroup" ALTER COLUMN "imageZoom" SET DEFAULT 1,
ALTER COLUMN "imageZoom" SET DATA TYPE DOUBLE PRECISION;

-- Eski x3/x4 qiymatlarni yangi maksimum x2 ga tushirish
UPDATE "PromoItem" SET "imageZoom" = 2 WHERE "imageZoom" > 2;
UPDATE "PromoItemGroup" SET "imageZoom" = 2 WHERE "imageZoom" > 2;
