-- MAKSIMAL ZAKAZ nazorati: kategoriya bo'yicha ruxsat etilgan eng katta zaxira kunlari.
-- Global standart AppSetting("zakaz_max_stockday") da; bu jadval faqat ISTISNOLARni saqlaydi.
--
-- DIQQAT: migrate diff yana "DROP INDEX Product_name_trgm_idx" taklif qildi — u qo'lda
-- yaratilgan GIN trgm indeks (promo va spisaniya qidiruvlari unga tayanadi), ATAYLAB
-- olib tashlandi.

-- CreateTable
CREATE TABLE "StockdayLimit" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "maxDays" INTEGER NOT NULL,
    "note" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockdayLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockdayLimit_categoryId_key" ON "StockdayLimit"("categoryId");

-- AddForeignKey
ALTER TABLE "StockdayLimit" ADD CONSTRAINT "StockdayLimit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
