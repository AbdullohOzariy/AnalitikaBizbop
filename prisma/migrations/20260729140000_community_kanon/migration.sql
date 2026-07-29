-- Community: SKU bog'lash OLIB TASHLANDI, KANONIK mahsulot reyestri qo'shildi.
-- "Shaftoli"/"shaftoli"/"Persik"/"Персик" endi bitta TgCanonProduct yozuviga yig'iladi.
--
-- DIQQAT: migrate diff yana "DROP INDEX Product_name_trgm_idx" taklif qildi — u qo'lda
-- yaratilgan GIN trgm indeks (promo va spisaniya qidiruvlari unga tayanadi), ATAYLAB
-- olib tashlandi. Migratsiyadan keyin indeks joyida turishi SHART.

-- Alias keshi butunlay qayta quriladi: eski qatorlar norm->productId edi, endi
-- normKey->canonId. canonId NOT NULL bo'lgani uchun eskilari saqlanib qola olmaydi.
-- Yo'qotish yo'q — kesh LLM tomonidan qayta hisoblanadi.
DELETE FROM "TgProductAlias";

-- DropForeignKey
ALTER TABLE "TgRequest" DROP CONSTRAINT "TgRequest_productId_fkey";


-- DropIndex
DROP INDEX "TgProductAlias_categoryId_idx";

-- DropIndex
DROP INDEX "TgProductAlias_norm_key";

-- DropIndex
DROP INDEX "TgRequest_productId_idx";

-- DropIndex
DROP INDEX "TgRequest_productNorm_idx";

-- AlterTable
ALTER TABLE "TgProductAlias" DROP COLUMN "categoryId",
DROP COLUMN "norm",
DROP COLUMN "productId",
ADD COLUMN     "canonId" INTEGER NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fuzzyKey" VARCHAR(120) NOT NULL,
ADD COLUMN     "normKey" VARCHAR(120) NOT NULL,
ADD COLUMN     "raw" VARCHAR(120) NOT NULL;

-- AlterTable
ALTER TABLE "TgRequest" DROP COLUMN "productId",
ADD COLUMN     "canonId" INTEGER,
ADD COLUMN     "normKey" VARCHAR(120);

-- CreateTable
CREATE TABLE "TgCanonProduct" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "fuzzyKey" VARCHAR(80) NOT NULL,
    "categoryId" INTEGER,
    "synonyms" TEXT[],
    "hits" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(6) NOT NULL DEFAULT 'AI',
    "reviewedAt" TIMESTAMP(3),
    "mergedIntoId" INTEGER,
    "mergedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgCanonProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgCanonMerge" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "sourceName" VARCHAR(80) NOT NULL,
    "targetName" VARCHAR(80) NOT NULL,
    "movedAliases" INTEGER NOT NULL,
    "movedRequests" INTEGER NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgCanonMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TgCanonProduct_nameKey_key" ON "TgCanonProduct"("nameKey");

-- CreateIndex
CREATE INDEX "TgCanonProduct_categoryId_idx" ON "TgCanonProduct"("categoryId");

-- CreateIndex
CREATE INDEX "TgCanonProduct_fuzzyKey_idx" ON "TgCanonProduct"("fuzzyKey");

-- CreateIndex
CREATE INDEX "TgCanonProduct_mergedIntoId_idx" ON "TgCanonProduct"("mergedIntoId");

-- CreateIndex
CREATE INDEX "TgCanonProduct_hits_idx" ON "TgCanonProduct"("hits" DESC);

-- CreateIndex
CREATE INDEX "TgCanonProduct_reviewedAt_idx" ON "TgCanonProduct"("reviewedAt");

-- CreateIndex
CREATE INDEX "TgCanonMerge_targetId_idx" ON "TgCanonMerge"("targetId");

-- CreateIndex
CREATE INDEX "TgCanonMerge_createdAt_idx" ON "TgCanonMerge"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TgProductAlias_normKey_key" ON "TgProductAlias"("normKey");

-- CreateIndex
CREATE INDEX "TgProductAlias_canonId_idx" ON "TgProductAlias"("canonId");

-- CreateIndex
CREATE INDEX "TgProductAlias_fuzzyKey_idx" ON "TgProductAlias"("fuzzyKey");

-- CreateIndex
CREATE INDEX "TgRequest_canonId_dayKey_idx" ON "TgRequest"("canonId", "dayKey");

-- CreateIndex
CREATE INDEX "TgRequest_normKey_idx" ON "TgRequest"("normKey");

-- AddForeignKey
ALTER TABLE "TgRequest" ADD CONSTRAINT "TgRequest_canonId_fkey" FOREIGN KEY ("canonId") REFERENCES "TgCanonProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgCanonProduct" ADD CONSTRAINT "TgCanonProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgCanonProduct" ADD CONSTRAINT "TgCanonProduct_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "TgCanonProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgProductAlias" ADD CONSTRAINT "TgProductAlias_canonId_fkey" FOREIGN KEY ("canonId") REFERENCES "TgCanonProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mavjud so'rovlar kanon reyestri bo'yicha QAYTA moslashtiriladi (matn, holat va
-- javob bog'lanishlari o'z joyida qoladi — faqat moslik natijasi tozalanadi).
UPDATE "TgRequest" SET "matchStatus" = 'PENDING', "matchScore" = NULL, "categoryId" = NULL;
