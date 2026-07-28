/**
 * Mijozlar guruhi botining webhook'i (GROUP_BOT_TOKEN). `/api/tg` dan alohida —
 * har bir bot o'z secret_token'i bilan tekshiriladi.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import type { Update } from "telegraf/types";
import { getGroupBot, groupWebhookSecret } from "@/lib/tg-group/bot";
import { redactForLog } from "@/lib/tg-redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = groupWebhookSecret();
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (
    !secret ||
    got.length !== secret.length ||
    !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bot = getGroupBot();
  if (!bot) return new NextResponse("Bot not configured", { status: 503 });

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Xato bo'lsa ham 200 — Telegram qayta-qayta yubormasin.
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    console.error("[tg-group-webhook] handleUpdate xato:", redactForLog(err));
  }
  return NextResponse.json({ ok: true });
}
