-- Ta'minotchi anketasi: sozlanuvchan maydonlar + javoblar
CREATE TABLE "AnketaField" (
    "id" SERIAL NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnketaField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnketaSubmission" (
    "id" SERIAL NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnketaSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnketaSubmission_status_createdAt_idx" ON "AnketaSubmission"("status", "createdAt");

-- Boshlang'ich maydonlar (Anketa.xlsx asosida) — keyin Tizim → Anketa'da tahrirlanadi
INSERT INTO "AnketaField" ("section", "label", "type", "required", "sortOrder") VALUES
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Kompaniya nomi', 'text', true, 0),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Brend nomi', 'text', false, 10),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'STIR / INN', 'text', true, 20),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Faoliyat boshlagan yil', 'number', false, 30),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Yuridik manzil', 'text', false, 40),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Ombor manzili', 'text', false, 50),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Direktor F.I.SH', 'text', true, 60),
  ('1. KOMPANIYA HAQIDA UMUMIY MA''LUMOT', 'Telefon raqam', 'text', true, 70),
  ('2. KOMPANIYA FAOLIYAT TURI', 'Ishlab chiqaruvchi', 'yesno', false, 80),
  ('2. KOMPANIYA FAOLIYAT TURI', 'Distribyutor (Filial yoki Diller)', 'yesno', false, 90),
  ('2. KOMPANIYA FAOLIYAT TURI', 'Importyor', 'yesno', false, 100),
  ('3. TOVAR MA''LUMOTLARI', 'Mahsulot kategoriyasi', 'text', true, 110),
  ('3. TOVAR MA''LUMOTLARI', 'Brendlar', 'textarea', false, 120),
  ('3. TOVAR MA''LUMOTLARI', 'SKU soni', 'number', false, 130),
  ('3. TOVAR MA''LUMOTLARI', 'Sertifikat mavjudmi?', 'yesno', false, 140),
  ('3. TOVAR MA''LUMOTLARI', 'Temperatura rejimi', 'text', false, 150),
  ('4. TIJORAT SHARTLARI', 'Minimal zakaz summasi', 'text', false, 160),
  ('4. TIJORAT SHARTLARI', 'Minimal zakaz soni', 'text', false, 170),
  ('4. TIJORAT SHARTLARI', 'Bizning supermarketimizdan qancha face berilishini xohlaysiz va shu berilgan face (metr) uchun qancha chegirma qila olasiz?', 'textarea', false, 180),
  ('4. TIJORAT SHARTLARI', 'Skladingizdan o''zimiz olib kelsak necha % skidka qilib berasiz?', 'text', false, 190),
  ('4. TIJORAT SHARTLARI', 'Narxlar qancha muddat stabil?', 'text', false, 200),
  ('4. TIJORAT SHARTLARI', 'Narx o''zgarishi haqida oldindan ogohlantiriladimi?', 'yesno', false, 210),
  ('4. TIJORAT SHARTLARI', 'Margin recommendation mavjudmi? (qaysi narxda yaxshi sotiladi, mahsulotga necha % marja qo''yish kerak)', 'textarea', false, 220),
  ('4. TIJORAT SHARTLARI', 'Retrobonus mavjudmi?', 'yesno', false, 230),
  ('4. TIJORAT SHARTLARI', 'Marketing bonusi bormi?', 'yesno', false, 240),
  ('4. TIJORAT SHARTLARI', 'Promo va aksiya davrida savdo jamoasi uchun motivatsion tizim qo''llaniladimi?', 'yesno', false, 250),
  ('4. TIJORAT SHARTLARI', 'Biz uchun Zavoddan alohida skidka qilib berolasizmi?', 'yesno', false, 260),
  ('5. TO''LOV SHARTLARI', 'Siz bizning rastalarimizga tovar terish uchun (yillik tavar ko''rinishida ostatka) byudjet ajratolasizmi?', 'yesno', false, 270),
  ('5. TO''LOV SHARTLARI', 'To''lov usuli qonunchilik bo''yicha buxgalteriya talablariga javob bera oladimi?', 'yesno', false, 280),
  ('5. TO''LOV SHARTLARI', 'Qarzdorlik limiti mavjudmi?', 'text', false, 290),
  ('5. TO''LOV SHARTLARI', 'Elektron hisob-faktura 1 ga 1 ishlatiladimi?', 'yesno', false, 300),
  ('6. LOGISTIKA', 'Zakaz aynan qo''shimcha tovarlarsiz kelishini ta''minlab bera olasizmi?', 'yesno', false, 310),
  ('6. LOGISTIKA', 'Yetkazib berish aynan biz bilan kelishilgan vaqtda kelishini ta''minlab bera olasizmi?', 'yesno', false, 320),
  ('6. LOGISTIKA', 'Haftalik yetkazib berish chastotasi', 'text', false, 330),
  ('6. LOGISTIKA', 'Zakazdan yetkazib berishgacha bo''lgan vaqt — Lead Time (kun)', 'number', false, 340),
  ('6. LOGISTIKA', 'Cross docking (filiallar bo''yicha yetkazib berish) bormi?', 'yesno', false, 350),
  ('6. LOGISTIKA', 'Sovutkich transporti mavjudmi?', 'yesno', false, 360),
  ('6. LOGISTIKA', 'Agent va supervisor FIFO bilan ishlaydimi?', 'yesno', false, 370),
  ('6. LOGISTIKA', 'Qaytarma (Vozvrat) siyosati qanday?', 'textarea', false, 380),
  ('7. TASDIQLASH', 'Anketani to''ldirgan shaxs (Ism-familiya)', 'text', true, 390),
  ('7. TASDIQLASH', 'Ma''lumotlar to''g''riligini tasdiqlayman. Ma''lumotlar to''g''riligi uzoq muddat hamkorlikda ishlashimizga sabab bo''ladi.', 'consent', true, 400);
