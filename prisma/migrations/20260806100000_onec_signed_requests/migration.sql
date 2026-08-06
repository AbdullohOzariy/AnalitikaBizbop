-- 1C qabul: nechta so'rov HMAC bilan imzolangani. Imzoni majburiy qilishdan
-- oldin shu songa qarab qaror qilinadi (imzolanmagan oqimni to'xtatib qo'ymaslik uchun).
--
-- ⚠️ Prisma diff bu yerga `DROP INDEX "Product_name_trgm_idx"` ni ham qo'shadi —
-- u ATAYLAB olib tashlangan: trigram indeks xom SQL bilan yaratilgan va Prisma
-- sxemasida ifodalanmaydi (tovar nomi bo'yicha noaniq qidiruv unga bog'liq).
ALTER TABLE "OnecIpLog" ADD COLUMN "signedRequests" INTEGER NOT NULL DEFAULT 0;
