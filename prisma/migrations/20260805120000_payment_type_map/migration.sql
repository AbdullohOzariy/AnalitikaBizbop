
-- CreateTable
CREATE TABLE "PaymentTypeMap" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'OTHER',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTypeMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTypeMap_name_key" ON "PaymentTypeMap"("name");
