-- NOTE: Prisma "Product_name_trgm_idx" (GIN trgm, perf_indexes'dan) ni schema'da
-- ifodalay olmaydi va DROP qilmoqchi bo'ladi — qidiruv indeksi kerak, DROP olib tashlandi.

-- CreateTable
CREATE TABLE "WarehouseStock" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseStock_productId_key" ON "WarehouseStock"("productId");

-- AddForeignKey
ALTER TABLE "WarehouseStock" ADD CONSTRAINT "WarehouseStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
