-- Mijozlar guruhi (Telegram) — so'rov/murojaat analitikasi uchun xom xabar arxivi.
-- Jonli webhook (source='LIVE') va Telegram Desktop JSON eksporti (source='EXPORT')
-- shu jadvalga yozadi.

-- CreateTable
CREATE TABLE "TgGroup" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "title" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgGroupMessage" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "threadId" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "fromId" BIGINT,
    "fromName" VARCHAR(120),
    "fromBot" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "mediaKind" VARCHAR(20),
    "replyToId" INTEGER,
    "editedAt" TIMESTAMP(3),
    "source" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgGroupMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TgGroup_chatId_key" ON "TgGroup"("chatId");

-- CreateIndex
CREATE INDEX "TgGroupMessage_chatId_sentAt_idx" ON "TgGroupMessage"("chatId", "sentAt");

-- CreateIndex
CREATE INDEX "TgGroupMessage_chatId_dayKey_idx" ON "TgGroupMessage"("chatId", "dayKey");

-- CreateIndex
CREATE INDEX "TgGroupMessage_chatId_replyToId_idx" ON "TgGroupMessage"("chatId", "replyToId");

-- CreateIndex
CREATE INDEX "TgGroupMessage_fromId_idx" ON "TgGroupMessage"("fromId");

-- CreateIndex
CREATE UNIQUE INDEX "TgGroupMessage_chatId_messageId_key" ON "TgGroupMessage"("chatId", "messageId");

-- AddForeignKey
ALTER TABLE "TgGroupMessage" ADD CONSTRAINT "TgGroupMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TgGroup"("chatId") ON DELETE CASCADE ON UPDATE CASCADE;
