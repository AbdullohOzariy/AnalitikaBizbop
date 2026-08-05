-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "onecShopId" INTEGER;

-- CreateTable
CREATE TABLE "Receipt" (
    "id" SERIAL NOT NULL,
    "shop" INTEGER NOT NULL,
    "pos" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "session" INTEGER NOT NULL,
    "openAt" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "type" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "fiscal" TEXT,
    "receiptBarcode" TEXT,
    "card" TEXT,
    "cashierId" INTEGER,
    "cashierName" TEXT,
    "qtyBuys" DECIMAL(20,3),
    "qtyPositions" INTEGER NOT NULL,
    "sum" DECIMAL(20,2) NOT NULL,
    "sumWithDiscs" DECIMAL(20,2) NOT NULL,
    "totalSum" DECIMAL(20,2) NOT NULL,
    "branchId" INTEGER,
    "externalId" TEXT,
    "eventId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" SERIAL NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemCode" INTEGER,
    "productId" INTEGER,
    "art" TEXT,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "classCode" TEXT,
    "packageCode" TEXT,
    "qty" DECIMAL(20,3) NOT NULL,
    "storno" INTEGER NOT NULL DEFAULT 0,
    "sum" DECIMAL(20,2) NOT NULL,
    "sumR" DECIMAL(20,2) NOT NULL,
    "sumWD" DECIMAL(20,2) NOT NULL,
    "sumWT" DECIMAL(20,2) NOT NULL,
    "totalSum" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptPayment" (
    "id" SERIAL NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'OTHER',
    "value" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "ReceiptPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_businessDate_idx" ON "Receipt"("businessDate");

-- CreateIndex
CREATE INDEX "Receipt_branchId_businessDate_idx" ON "Receipt"("branchId", "businessDate");

-- CreateIndex
CREATE INDEX "Receipt_eventId_idx" ON "Receipt"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_shop_pos_businessDate_number_session_key" ON "Receipt"("shop", "pos", "businessDate", "number", "session");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptLine_productId_idx" ON "ReceiptLine"("productId");

-- CreateIndex
CREATE INDEX "ReceiptLine_itemCode_idx" ON "ReceiptLine"("itemCode");

-- CreateIndex
CREATE INDEX "ReceiptPayment_receiptId_idx" ON "ReceiptPayment"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptPayment_kind_idx" ON "ReceiptPayment"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_onecShopId_key" ON "Branch"("onecShopId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "IntegrationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptPayment" ADD CONSTRAINT "ReceiptPayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
