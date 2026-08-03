-- CreateEnum
CREATE TYPE "CashAccountKind" AS ENUM ('CASH', 'BANK', 'CARD');

-- CreateEnum
CREATE TYPE "CashFlowSection" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CashArticleDirection" AS ENUM ('IN_ONLY', 'OUT_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "CostCenterKind" AS ENUM ('BRANCH', 'PROJECT', 'COMPANY');

-- CreateEnum
CREATE TYPE "CounterpartyKind" AS ENUM ('EMPLOYEE', 'SUPPLIER', 'ACCOUNTABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "CashTxnSource" AS ENUM ('MANUAL', 'MINIAPP', 'IMPORT');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FINANCE';

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CostCenterKind" NOT NULL,
    "branchId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccount" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CashAccountKind" NOT NULL DEFAULT 'CASH',
    "branchId" INTEGER,
    "costCenterId" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "trustedFrom" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccountAlias" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "CashAccountAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowGroup" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" "CashFlowSection" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CashFlowGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowArticle" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "direction" "CashArticleDirection" NOT NULL DEFAULT 'BOTH',
    "isNeutral" BOOLEAN NOT NULL DEFAULT false,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "CashFlowArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowArticleAlias" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "CashFlowArticleAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CounterpartyKind" NOT NULL DEFAULT 'OTHER',
    "supplierId" INTEGER,
    "phone" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterpartyAlias" (
    "id" SERIAL NOT NULL,
    "counterpartyId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "CounterpartyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTxn" (
    "id" SERIAL NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "accountId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "counterpartyId" INTEGER,
    "costCenterId" INTEGER,
    "note" TEXT,
    "transferId" INTEGER,
    "source" "CashTxnSource" NOT NULL DEFAULT 'MANUAL',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "sourceRowHash" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransfer" (
    "id" SERIAL NOT NULL,
    "fromAccountId" INTEGER NOT NULL,
    "toAccountId" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAccountOpening" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "onDate" DATE NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashAccountOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCashAccount" (
    "userId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,

    CONSTRAINT "UserCashAccount_pkey" PRIMARY KEY ("userId","accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_name_key" ON "CostCenter"("name");

-- CreateIndex
CREATE INDEX "CostCenter_branchId_idx" ON "CostCenter"("branchId");

-- CreateIndex
CREATE INDEX "CostCenter_kind_idx" ON "CostCenter"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_name_key" ON "CashAccount"("name");

-- CreateIndex
CREATE INDEX "CashAccount_branchId_idx" ON "CashAccount"("branchId");

-- CreateIndex
CREATE INDEX "CashAccount_costCenterId_idx" ON "CashAccount"("costCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccountAlias_alias_key" ON "CashAccountAlias"("alias");

-- CreateIndex
CREATE INDEX "CashAccountAlias_accountId_idx" ON "CashAccountAlias"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowGroup_code_key" ON "CashFlowGroup"("code");

-- CreateIndex
CREATE INDEX "CashFlowGroup_section_idx" ON "CashFlowGroup"("section");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowArticle_code_key" ON "CashFlowArticle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowArticle_name_key" ON "CashFlowArticle"("name");

-- CreateIndex
CREATE INDEX "CashFlowArticle_groupId_idx" ON "CashFlowArticle"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowArticleAlias_alias_key" ON "CashFlowArticleAlias"("alias");

-- CreateIndex
CREATE INDEX "CashFlowArticleAlias_articleId_idx" ON "CashFlowArticleAlias"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Counterparty_name_key" ON "Counterparty"("name");

-- CreateIndex
CREATE INDEX "Counterparty_supplierId_idx" ON "Counterparty"("supplierId");

-- CreateIndex
CREATE INDEX "Counterparty_kind_idx" ON "Counterparty"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "CounterpartyAlias_alias_key" ON "CounterpartyAlias"("alias");

-- CreateIndex
CREATE INDEX "CounterpartyAlias_counterpartyId_idx" ON "CounterpartyAlias"("counterpartyId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTxn_sourceRowHash_key" ON "CashTxn"("sourceRowHash");

-- CreateIndex
CREATE INDEX "CashTxn_businessDate_idx" ON "CashTxn"("businessDate");

-- CreateIndex
CREATE INDEX "CashTxn_accountId_businessDate_idx" ON "CashTxn"("accountId", "businessDate");

-- CreateIndex
CREATE INDEX "CashTxn_articleId_businessDate_idx" ON "CashTxn"("articleId", "businessDate");

-- CreateIndex
CREATE INDEX "CashTxn_counterpartyId_idx" ON "CashTxn"("counterpartyId");

-- CreateIndex
CREATE INDEX "CashTxn_costCenterId_idx" ON "CashTxn"("costCenterId");

-- CreateIndex
CREATE INDEX "CashTxn_transferId_idx" ON "CashTxn"("transferId");

-- CreateIndex
CREATE INDEX "CashTransfer_businessDate_idx" ON "CashTransfer"("businessDate");

-- CreateIndex
CREATE INDEX "CashTransfer_fromAccountId_idx" ON "CashTransfer"("fromAccountId");

-- CreateIndex
CREATE INDEX "CashTransfer_toAccountId_idx" ON "CashTransfer"("toAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccountOpening_accountId_onDate_key" ON "CashAccountOpening"("accountId", "onDate");

-- CreateIndex
CREATE INDEX "UserCashAccount_accountId_idx" ON "UserCashAccount"("accountId");

-- AddForeignKey
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccountAlias" ADD CONSTRAINT "CashAccountAlias_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowArticle" ADD CONSTRAINT "CashFlowArticle_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CashFlowGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowArticleAlias" ADD CONSTRAINT "CashFlowArticleAlias_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "CashFlowArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counterparty" ADD CONSTRAINT "Counterparty_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterpartyAlias" ADD CONSTRAINT "CounterpartyAlias_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "CashFlowArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "CashTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTxn" ADD CONSTRAINT "CashTxn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAccountOpening" ADD CONSTRAINT "CashAccountOpening_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCashAccount" ADD CONSTRAINT "UserCashAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCashAccount" ADD CONSTRAINT "UserCashAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
