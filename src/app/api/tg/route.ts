/**
 * Telegram webhook qabul qiluvchi (token URL'da EMAS — xavfsizroq).
 * Telegram `X-Telegram-Bot-Api-Secret-Token` header'ini yuboradi; uni
 * BOT_TOKEN'dan hosil qilingan secret bilan (doimiy vaqtli) solishtiramiz.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import type { Update } from "telegraf/types";
import { getBot, webhookSecret } from "@/lib/spisaniya/bot";
import { redactForLog } from "@/lib/tg-redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = webhookSecret();
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (
    !secret ||
    got.length !== secret.length ||
    !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))
  ) {
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

  // Xato bo'lsa ham 200 qaytaramiz (Telegram qayta-qayta yubormasin).
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    console.error("[tg-webhook] handleUpdate xato:", redactForLog(err));
  }
  return NextResponse.json({ ok: true });
}
