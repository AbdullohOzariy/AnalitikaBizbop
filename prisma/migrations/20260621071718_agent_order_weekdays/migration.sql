-- NOTE: Product_name_trgm_idx (GIN trgm, perf_indexes'dan) schema'da yo'q — DROP olib tashlandi.

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "orderWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
