-- Finans sahifasi filtri (spentAt oralig'i + deletedAt IS NULL) uchun composite indeks
CREATE INDEX IF NOT EXISTS "Expense_spentAt_deletedAt_idx" ON "Expense"("spentAt", "deletedAt");
