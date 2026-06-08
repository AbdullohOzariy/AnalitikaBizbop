-- Expense: Sotuv bo'limi harajatlari (filialsiz, umumiy)
CREATE TABLE "Expense" (
  "id"          SERIAL         NOT NULL,
  "name"        TEXT           NOT NULL,
  "quantity"    DECIMAL(20,3)  NOT NULL,
  "unitPrice"   DECIMAL(20,2)  NOT NULL,
  "amount"      DECIMAL(20,2)  NOT NULL,
  "spentAt"     DATE           NOT NULL,
  "createdById" INTEGER        NOT NULL,
  "createdAt"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_spentAt_idx" ON "Expense"("spentAt");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
