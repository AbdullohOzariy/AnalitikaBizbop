-- NOTE: Prisma "Product_name_trgm_idx" (GIN trgm, perf_indexes migratsiyasidan) ni
-- schema'da ifodalay olmaydi va uni DROP qilmoqchi bo'ladi. Qidiruv indeksi kerak —
-- DROP olib tashlandi (indeks saqlanadi).

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "agentId" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "agentId" INTEGER;

-- CreateTable
CREATE TABLE "Agent" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "contactName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOrderDay" (
    "id" SERIAL NOT NULL,
    "agentId" INTEGER NOT NULL,
    "sana" DATE NOT NULL,

    CONSTRAINT "AgentOrderDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agent_supplierId_idx" ON "Agent"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_supplierId_name_key" ON "Agent"("supplierId", "name");

-- CreateIndex
CREATE INDEX "AgentOrderDay_sana_idx" ON "AgentOrderDay"("sana");

-- CreateIndex
CREATE UNIQUE INDEX "AgentOrderDay_agentId_sana_key" ON "AgentOrderDay"("agentId", "sana");

-- CreateIndex
CREATE INDEX "Product_agentId_idx" ON "Product"("agentId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_agentId_idx" ON "PurchaseOrder"("agentId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOrderDay" ADD CONSTRAINT "AgentOrderDay_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
