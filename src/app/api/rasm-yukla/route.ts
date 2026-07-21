/**
 * Miniapp rasm yuklash: rasmni guruhga vaqtinchalik yuborib `file_id` olamiz,
 * so'ng o'sha xabarni o'chiramiz. Keyin yozuv shu file_id bilan saqlanadi.
 * Auth shart emas (miniapp).
 */
import { NextResponse } from "next/server";
import { getBot } from "@/lib/spisaniya/bot";
import { getGroupChatId, ruxsatBormi } from "@/lib/spisaniya/db";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { sverkaRuxsatBormi } from "@/lib/sverka/ruxsat";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import { redactError, redactForLog } from "@/lib/tg-redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!rateLimit(`rasm:${user.id}`, 15, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p rasm. Birozdan keyin urinib ko'ring." }, { status: 429 });
  }
  // Spisaniya YOKI sverka roli yetarli (rasm sxemasi umumiy)
  if (!(await ruxsatBormi(user.id)) && !(await sverkaRuxsatBormi(user.id).catch(() => false))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const file = form.get("rasm");
    if (!(file instanceof File)) {
      return NextResponse.json({ xato: "Rasm topilmadi" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ xato: "Rasm 10MB dan oshmasligi kerak" }, { status: 413 });
    }
    if (file.type && !/^image\//.test(file.type)) {
      return NextResponse.json({ xato: "Faqat rasm fayli qabul qilinadi" }, { status: 415 });
    }

    const bot = getBot();
    if (!bot) return NextResponse.json({ xato: "Bot sozlanmagan" }, { status: 503 });

    const chatId = await getGroupChatId();
    if (!chatId) return NextResponse.json({ xato: "GROUP_CHAT_ID sozlanmagan" }, { status: 500 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // Magic-byte tekshiruvi — mijoz bergan file.type'ga ishonmaymiz (JPEG/PNG/GIF/WEBP)
    const b = buffer;
    const isRealImage =
      (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || // JPEG
      (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || // PNG
      (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) || // GIF
      (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50); // WEBP
    if (!isRealImage) {
      return NextResponse.json({ xato: "Fayl haqiqiy rasm emas" }, { status: 415 });
    }
    const result = await bot.telegram.sendPhoto(chatId, {
      source: buffer,
      filename: file.name || "rasm.jpg",
    });
    await bot.telegram.deleteMessage(chatId, result.message_id).catch(() => {});

    const photos = result.photo;
    const fileId = photos[photos.length - 1].file_id;
    return NextResponse.json({ file_id: fileId });
  } catch (err) {
    // sendPhoto tarmoq xatosi xabarga bot token'li URL qo'shadi — mijozga
    // (miniapp) ham, log'ga ham faqat tozalangan matn chiqadi.
    const msg = err instanceof Error ? redactError(err) : "Rasm yuklanmadi";
    console.error("[api/rasm-yukla]", redactForLog(err));
    return NextResponse.json({ xato: "Rasm yuklanmadi: " + msg }, { status: 500 });
  }
}
