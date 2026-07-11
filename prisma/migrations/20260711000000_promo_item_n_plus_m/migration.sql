-- N+M ("N dona ol, M dona tekin": 1+1, 2+1, 3+2...) mexanikasi.
-- Ikkisi ham to'lsa faol; ikkisi ham NULL = oddiy narx-chegirma (mavjud yozuvlar shunday qoladi).
-- AlterTable
ALTER TABLE "PromoItem" ADD COLUMN     "buyQty" INTEGER,
ADD COLUMN     "freeQty" INTEGER;
