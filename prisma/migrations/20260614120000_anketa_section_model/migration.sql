-- Bo'lim (section) string'dan alohida AnketaSection entity'siga ko'chirish (data-preserving).
-- Maqsad: bo'sh bo'lim, nom tahriri, toza reorder/delete.

-- 1. AnketaSection jadvali
CREATE TABLE "AnketaSection" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnketaSection_pkey" PRIMARY KEY ("id")
);

-- 2. Mavjud distinct bo'limlardan AnketaSection yozuvlari (joriy tartibni saqlab)
INSERT INTO "AnketaSection" ("title", "sortOrder")
SELECT "section", (ROW_NUMBER() OVER (ORDER BY MIN("sortOrder"), MIN("id")) - 1) * 10
FROM "AnketaField"
GROUP BY "section";

-- 3. sectionId ustuni (avval nullable — backfill uchun)
ALTER TABLE "AnketaField" ADD COLUMN "sectionId" INTEGER;

-- 4. Backfill: maydon section matni → AnketaSection.id
UPDATE "AnketaField" f
SET "sectionId" = s."id"
FROM "AnketaSection" s
WHERE f."section" = s."title";

-- 5. NOT NULL + FK (bo'lim o'chsa — maydonlari ham cascade)
ALTER TABLE "AnketaField" ALTER COLUMN "sectionId" SET NOT NULL;
ALTER TABLE "AnketaField"
    ADD CONSTRAINT "AnketaField_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "AnketaSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Eski section ustunini olib tashlash
ALTER TABLE "AnketaField" DROP COLUMN "section";

-- 7. Index
CREATE INDEX "AnketaField_sectionId_sortOrder_idx" ON "AnketaField"("sectionId", "sortOrder");
