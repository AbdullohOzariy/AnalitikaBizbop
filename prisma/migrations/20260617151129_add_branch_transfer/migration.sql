-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BranchTransfer" (
    "id" SERIAL NOT NULL,
    "fromBranchId" INTEGER NOT NULL,
    "toBranchId" INTEGER NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "targetDays" INTEGER NOT NULL DEFAULT 7,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "BranchTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchTransferItem" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" DECIMAL(20,3) NOT NULL,

    CONSTRAINT "BranchTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchTransfer_fromBranchId_idx" ON "BranchTransfer"("fromBranchId");

-- CreateIndex
CREATE INDEX "BranchTransfer_toBranchId_idx" ON "BranchTransfer"("toBranchId");

-- CreateIndex
CREATE INDEX "BranchTransfer_status_idx" ON "BranchTransfer"("status");

-- CreateIndex
CREATE INDEX "BranchTransferItem_productId_idx" ON "BranchTransferItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchTransferItem_transferId_productId_key" ON "BranchTransferItem"("transferId", "productId");

-- AddForeignKey
ALTER TABLE "BranchTransfer" ADD CONSTRAINT "BranchTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransfer" ADD CONSTRAINT "BranchTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransfer" ADD CONSTRAINT "BranchTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferItem" ADD CONSTRAINT "BranchTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "BranchTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferItem" ADD CONSTRAINT "BranchTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
