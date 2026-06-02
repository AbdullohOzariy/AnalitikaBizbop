/**
 * Miniapp rasm yuklash: rasmni guruhga vaqtinchalik yuborib `file_id` olamiz,
 * so'ng o'sha xabarni o'chiramiz. Keyin yozuv shu file_id bilan saqlanadi.
 * Auth shart emas (miniapp).
 */
import { NextResponse } from "next/server";
import { getBot } from "@/lib/spisaniya/bot";
import { getGroupChatId } from "@/lib/spisaniya/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
