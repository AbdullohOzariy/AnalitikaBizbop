-- MarginPlan.categoryId FK indeksi (standart: FK har doim indeksli)
CREATE INDEX IF NOT EXISTS "MarginPlan_categoryId_idx" ON "MarginPlan"("categoryId");

-- Expense soft-delete — moliyaviy yozuv butunlay o'chmaydi
ALTER TABLE "Expense" ADD COLUMN "deletedAt" TIMESTAMP(3);
