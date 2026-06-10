-- Blok/yashik/pachka: SKU'da pachka hajmi (eslab qolinadi) + zakaz qatorida blok ko'rinishi
ALTER TABLE "Product" ADD COLUMN "packSize" INTEGER;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "packCount" INTEGER;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "packSize" INTEGER;
