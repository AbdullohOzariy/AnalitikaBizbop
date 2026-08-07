-- To'lov turi: enum → boshqariladigan JADVAL.
--
-- ⚠️ Prisma diff bu yerga `DROP COLUMN "kind"` + `ADD COLUMN "kind"` yozadi —
-- u MAVJUD TURLARNI YO'Q QILADI (barcha to'lovlar 'OTHER' bo'lib qolardi).
-- Shuning uchun qo'lda `ALTER COLUMN ... TYPE TEXT USING kind::text` ishlatilgan:
-- enum qiymati matnga aynan o'girilib saqlanadi.
--
-- ⚠️ Diff shuningdek `DROP INDEX "Product_name_trgm_idx"` qo'shadi — u ATAYLAB
-- olib tashlangan: trigram indeks xom SQL bilan yaratilgan va Prisma sxemasida
-- ifodalanmaydi (tovar nomi bo'yicha noaniq qidiruv unga bog'liq).

-- 1) ReceiptPayment.kind: enum → text (qiymatlar saqlanadi)
ALTER TABLE "ReceiptPayment" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "ReceiptPayment" ALTER COLUMN "kind" TYPE TEXT USING "kind"::text;
ALTER TABLE "ReceiptPayment" ALTER COLUMN "kind" SET DEFAULT 'OTHER';

-- 2) PaymentTypeMap.kind: enum → text
ALTER TABLE "PaymentTypeMap" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "PaymentTypeMap" ALTER COLUMN "kind" TYPE TEXT USING "kind"::text;
ALTER TABLE "PaymentTypeMap" ALTER COLUMN "kind" SET DEFAULT 'OTHER';

-- 3) Endi enum hech qayerda ishlatilmaydi
DROP TYPE "PaymentKind";

-- 4) Turlar jadvali
CREATE TABLE "PaymentKindDef" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCash" BOOLEAN NOT NULL DEFAULT false,
    "tone" TEXT NOT NULL DEFAULT 'slate',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentKindDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentKindDef_code_key" ON "PaymentKindDef"("code");
CREATE INDEX "PaymentKindDef_sortOrder_idx" ON "PaymentKindDef"("sortOrder");

-- 5) Mavjud to'rt tur — tizim turlari, o'chirilmaydi.
--    Ular ilgari enum bo'lgani uchun cheklarda allaqachon shu kodlar turibdi.
INSERT INTO "PaymentKindDef" ("code","name","isCash","tone","sortOrder","isSystem","updatedAt")
VALUES
  ('CASH',     'Naqd',      true,  'green',  10,  true, NOW()),
  ('CARD',     'Plastik',   false, 'blue',   20,  true, NOW()),
  ('TRANSFER', 'O''tkazma', false, 'violet', 30,  true, NOW()),
  ('OTHER',    'Boshqa',    false, 'slate',  900, true, NOW());
