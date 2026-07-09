-- CreateTable
CREATE TABLE "BotUserCategory" (
    "telegramId" BIGINT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotUserCategory_pkey" PRIMARY KEY ("telegramId","categoryId")
);

-- CreateIndex
CREATE INDEX "BotUserCategory_categoryId_idx" ON "BotUserCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "BotUserCategory" ADD CONSTRAINT "BotUserCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
