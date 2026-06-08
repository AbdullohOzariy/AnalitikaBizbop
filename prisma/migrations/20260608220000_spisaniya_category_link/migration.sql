-- SpisaniyaCategoryLink: bizbop kategoriya nomi → Iyerarxiya kategoriya/subkat
CREATE TABLE "SpisaniyaCategoryLink" (
  "id"         SERIAL       NOT NULL,
  "botName"    TEXT         NOT NULL,
  "categoryId" INTEGER      NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SpisaniyaCategoryLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpisaniyaCategoryLink_botName_key" ON "SpisaniyaCategoryLink"("botName");
CREATE INDEX "SpisaniyaCategoryLink_categoryId_idx" ON "SpisaniyaCategoryLink"("categoryId");

ALTER TABLE "SpisaniyaCategoryLink"
  ADD CONSTRAINT "SpisaniyaCategoryLink_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
