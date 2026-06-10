-- SKU'ning ABC×XYZ matritsa holati — butun tizimda rang berish uchun denormalizatsiya
ALTER TABLE "Product" ADD COLUMN "abcClass" CHAR(1);
ALTER TABLE "Product" ADD COLUMN "xyzClass" CHAR(1);
