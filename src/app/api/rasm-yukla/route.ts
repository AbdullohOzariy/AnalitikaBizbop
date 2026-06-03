/**
 * Miniapp rasm yuklash: rasmni guruhga vaqtinchalik yuborib `file_id` olamiz,
 * so'ng o'sha xabarni o'chiramiz. Keyin yozuv shu file_id bilan saqlanadi.
 * Auth shart emas (miniapp).
 */
import { NextResponse } from "next/server";
import { getBot } from "@/lib/spisaniya/bot";
import { getGroupChatId, ruxsatBormi } from "@/lib/spisaniya/db";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const file = form.get("rasm");
    if (!(file instanceof File)) {
      return NextResponse.json({ xato: "Rasm topilmadi" }, { status: 400 });
    }

    const bot = getBot();
    if (!bot) return NextResponse.json({ xato: "Bot sozlanmagan" }, { status: 503 });

    const chatId = await getGroupChatId();
    if (!chatId) return NextResponse.json({ xato: "GROUP_CHAT_ID sozlanmagan" }, { status: 500 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await bot.telegram.sendPhoto(chatId, {
      source: buffer,
      filename: file.name || "rasm.jpg",
    });
    await bot.telegram.deleteMessage(chatId, result.message_id).catch(() => {});

    const photos = result.photo;
    const fileId = photos[photos.length - 1].file_id;
    return NextResponse.json({ file_id: fileId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Rasm yuklanmadi";
    console.error("[api/rasm-yukla]", msg);
    return NextResponse.json({ xato: "Rasm yuklanmadi: " + msg }, { status: 500 });
  }
}
