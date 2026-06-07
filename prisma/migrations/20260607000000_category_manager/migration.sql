-- Kategoriya menejeri ↔ kategoriya (ko'p-ko'p javobgarlik).

-- CreateTable
CREATE TABLE "CategoryManager" (
    "userId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    CONSTRAINT "CategoryManager_pkey" PRIMARY KEY ("userId", "categoryId")
);

-- CreateIndex
CREATE INDEX "CategoryManager_categoryId_idx" ON "CategoryManager"("categoryId");

-- AddForeignKey
ALTER TABLE "CategoryManager" ADD CONSTRAINT "CategoryManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryManager" ADD CONSTRAINT "CategoryManager_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
