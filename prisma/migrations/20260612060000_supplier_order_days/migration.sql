-- Zakaz qabul kunlari: haftalik takror o'rniga aniq sanalar
CREATE TABLE "SupplierOrderDay" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "sana" DATE NOT NULL,
    CONSTRAINT "SupplierOrderDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierOrderDay_supplierId_sana_key" ON "SupplierOrderDay"("supplierId", "sana");
CREATE INDEX "SupplierOrderDay_sana_idx" ON "SupplierOrderDay"("sana");
ALTER TABLE "SupplierOrderDay" ADD CONSTRAINT "SupplierOrderDay_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mavjud haftalik jadvallardan kelgusi 8 hafta uchun sanalar yaratamiz
-- (operatsion uzilish bo'lmasin; keyin kalendar orqali qo'lda yuritiladi)
INSERT INTO "SupplierOrderDay" ("supplierId", "sana")
SELECT s.id, d::date
FROM "Supplier" s
CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '55 days', INTERVAL '1 day') AS d
WHERE COALESCE(array_length(s."orderWeekdays", 1), 0) > 0
  AND EXTRACT(DOW FROM d)::int = ANY(s."orderWeekdays")
ON CONFLICT DO NOTHING;
