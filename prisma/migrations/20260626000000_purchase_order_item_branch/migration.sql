-- Zakaz qatori × filial taqsimoti (PurchaseOrderItem.quantity = yig'indisi)
CREATE TABLE "PurchaseOrderItemBranch" (
    "id" SERIAL NOT NULL,
    "orderItemId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    CONSTRAINT "PurchaseOrderItemBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrderItemBranch_orderItemId_branchId_key" ON "PurchaseOrderItemBranch"("orderItemId", "branchId");
CREATE INDEX "PurchaseOrderItemBranch_branchId_idx" ON "PurchaseOrderItemBranch"("branchId");

ALTER TABLE "PurchaseOrderItemBranch" ADD CONSTRAINT "PurchaseOrderItemBranch_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItemBranch" ADD CONSTRAINT "PurchaseOrderItemBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
