-- NOTE: Product_name_trgm_idx (GIN trgm, perf_indexes'dan) schema'da yo'q — DROP olib tashlandi.

-- AlterTable
ALTER TABLE "ProductSales" ADD COLUMN     "costPrice" DECIMAL(20,3),
ADD COLUMN     "salePrice" DECIMAL(20,3);
