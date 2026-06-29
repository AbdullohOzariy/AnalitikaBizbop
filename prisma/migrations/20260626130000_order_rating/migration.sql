-- Yetib kelgan zakaz bahosi (1..5) — yetkazib beruvchi o'rtachasi uchun
ALTER TABLE "PurchaseOrder" ADD COLUMN "rating" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "ratingNote" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "ratedAt" TIMESTAMP(3);
