-- Nom farqi review jadvali (kunlik sotuv fayli vs master nom).

-- CreateTable
CREATE TABLE "ProductNameMismatch" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedFileId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductNameMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductNameMismatch_productId_key" ON "ProductNameMismatch"("productId");

-- AddForeignKey
ALTER TABLE "ProductNameMismatch" ADD CONSTRAINT "ProductNameMismatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
