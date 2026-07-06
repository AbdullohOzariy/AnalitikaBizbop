-- String -> enum. MUHIM: Prisma avtomatik DROP/ADD COLUMN taklif qiladi (ma'lumot
-- yo'qoladi) — buning o'rniga ALTER ... USING bilan mavjud qiymatlarni saqlaymiz.
-- Prod qiymatlari enum a'zolariga aynan mos (tekshirilgan).

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PERECHISLENIYE', 'NAQD');
CREATE TYPE "AnketaFieldType" AS ENUM ('text', 'textarea', 'number', 'yesno', 'consent');
CREATE TYPE "SubmissionStatus" AS ENUM ('NEW', 'REVIEWED');

-- Supplier.paymentType (nullable) — mavjud qiymatlar saqlanadi
ALTER TABLE "Supplier"
  ALTER COLUMN "paymentType" TYPE "PaymentType" USING "paymentType"::"PaymentType";

-- AnketaField.type — default'ni vaqtincha olib, tipni o'zgartirib, qayta qo'yamiz
ALTER TABLE "AnketaField" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "AnketaField"
  ALTER COLUMN "type" TYPE "AnketaFieldType" USING "type"::"AnketaFieldType";
ALTER TABLE "AnketaField" ALTER COLUMN "type" SET DEFAULT 'text';

-- AnketaSubmission.status — mavjud REVIEWED/NEW saqlanadi (indeks avtomatik qayta quriladi)
ALTER TABLE "AnketaSubmission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AnketaSubmission"
  ALTER COLUMN "status" TYPE "SubmissionStatus" USING "status"::"SubmissionStatus";
ALTER TABLE "AnketaSubmission" ALTER COLUMN "status" SET DEFAULT 'NEW';
