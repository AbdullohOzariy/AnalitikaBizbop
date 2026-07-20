-- NOTE: Product_name_trgm_idx (GIN trgm, perf_indexes'dan) schema'da yo'q — DROP olib tashlandi.
-- NOTE: Reys qulfi (Trip_open_per_vehicle_uniq / Trip_open_per_driver_uniq /
--       TripLeg_open_per_trip_uniq) bu migratsiyada TEGILMAYDI — tekshirildi.

-- AlterEnum: yuk darajasiga ¾ qo'shildi (miniappda 5 chip: bo'sh/¼/½/¾/to'la)
ALTER TYPE "LoadLevel" ADD VALUE 'THREE_QUARTER';
