-- AlterTable
ALTER TABLE "PromoItem" ADD COLUMN     "limitUnit" TEXT NOT NULL DEFAULT 'dona';

-- AlterTable
ALTER TABLE "PromoItemGroup" ADD COLUMN     "limitUnit" TEXT NOT NULL DEFAULT 'dona';
