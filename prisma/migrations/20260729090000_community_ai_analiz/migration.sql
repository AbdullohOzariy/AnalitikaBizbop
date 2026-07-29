-- Community (mijozlar guruhi) AI tahlili: oyna holati, so'rovlar, nom→SKU keshi.
-- DIQQAT: migrate diff yana "DROP INDEX Product_name_trgm_idx" taklif qildi —
-- u qo'lda yaratilgan GIN trgm indeks (schema.prisma'da ifodalanmaydi), ATAYLAB olib tashlandi.

-- CreateTable
CREATE TABLE "TgAnalysisWindow" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "seq" INTEGER NOT NULL,
    "firstMessageId" INTEGER NOT NULL,
    "lastMessageId" INTEGER NOT NULL,
    "msgCount" INTEGER NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "model" VARCHAR(48) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "error" VARCHAR(300),
    "inTokens" INTEGER,
    "outTokens" INTEGER,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgAnalysisWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgRequest" (
    "id" SERIAL NOT NULL,
    "windowId" INTEGER NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "itemIndex" INTEGER NOT NULL DEFAULT 0,
    "dayKey" VARCHAR(10) NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "answerScope" VARCHAR(12),
    "lang" VARCHAR(3) NOT NULL,
    "asksPrice" BOOLEAN NOT NULL DEFAULT false,
    "asksPhoto" BOOLEAN NOT NULL DEFAULT false,
    "productText" VARCHAR(120),
    "productNorm" VARCHAR(120),
    "searchTerms" TEXT[],
    "brand" VARCHAR(60),
    "branchId" INTEGER,
    "productId" INTEGER,
    "categoryId" INTEGER,
    "matchStatus" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "matchScore" DOUBLE PRECISION,
    "priceQuoted" DECIMAL(14,2),
    "priceUnit" VARCHAR(4),
    "firstAnswerAt" TIMESTAMP(3),
    "answerMinutes" INTEGER,
    "answerIds" INTEGER[],
    "dupOfId" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL,
    "note" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgProductAlias" (
    "id" SERIAL NOT NULL,
    "norm" VARCHAR(120) NOT NULL,
    "productId" INTEGER,
    "categoryId" INTEGER,
    "source" VARCHAR(6) NOT NULL,
    "score" DOUBLE PRECISION,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TgAnalysisWindow_chatId_dayKey_idx" ON "TgAnalysisWindow"("chatId", "dayKey");

-- CreateIndex
CREATE INDEX "TgAnalysisWindow_status_idx" ON "TgAnalysisWindow"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TgAnalysisWindow_chatId_dayKey_seq_key" ON "TgAnalysisWindow"("chatId", "dayKey", "seq");

-- CreateIndex
CREATE INDEX "TgRequest_chatId_dayKey_kind_idx" ON "TgRequest"("chatId", "dayKey", "kind");

-- CreateIndex
CREATE INDEX "TgRequest_dayKey_status_idx" ON "TgRequest"("dayKey", "status");

-- CreateIndex
CREATE INDEX "TgRequest_categoryId_dayKey_idx" ON "TgRequest"("categoryId", "dayKey");

-- CreateIndex
CREATE INDEX "TgRequest_productNorm_idx" ON "TgRequest"("productNorm");

-- CreateIndex
CREATE INDEX "TgRequest_productId_idx" ON "TgRequest"("productId");

-- CreateIndex
CREATE INDEX "TgRequest_matchStatus_idx" ON "TgRequest"("matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TgRequest_chatId_messageId_itemIndex_key" ON "TgRequest"("chatId", "messageId", "itemIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TgProductAlias_norm_key" ON "TgProductAlias"("norm");

-- CreateIndex
CREATE INDEX "TgProductAlias_categoryId_idx" ON "TgProductAlias"("categoryId");

-- AddForeignKey
ALTER TABLE "TgRequest" ADD CONSTRAINT "TgRequest_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "TgAnalysisWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgRequest" ADD CONSTRAINT "TgRequest_chatId_messageId_fkey" FOREIGN KEY ("chatId", "messageId") REFERENCES "TgGroupMessage"("chatId", "messageId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgRequest" ADD CONSTRAINT "TgRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgRequest" ADD CONSTRAINT "TgRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgRequest" ADD CONSTRAINT "TgRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

