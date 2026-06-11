-- Zakaz workflow: yangi statuslar + fakt miqdor
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "factQty" DECIMAL(20,3);
