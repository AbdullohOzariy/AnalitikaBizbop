/**
 * Telegram webhook qabul qiluvchi. Telegram bu URL'ga update POST qiladi:
 *   {WEBHOOK_URL}/api/tg/{BOT_TOKEN}
 * Token URL'da — faqat to'g'ri token bilan kelgan so'rovni qabul qilamiz.
 */
import { NextResponse } from "next/server";
import type { Update } from "telegraf/types";
import { getBot } from "@/lib/spisaniya/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!process.env.BOT_TOKEN || token !== process.env.BOT_TOKEN) {
    return new NextResponse("Not found", { status: 404 });
  }
  const bot = getBot();
  if (!bot) return new NextResponse("Bot not configured", { status: 503 });

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Update'ni qayta ishlaymiz; xato bo'lsa ham Telegram'ga 200 qaytaramiz
  // (aks holda Telegram qayta-qayta yuboraveradi).
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    console.error("[tg-webhook] handleUpdate xato:", err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ ok: true });
}
