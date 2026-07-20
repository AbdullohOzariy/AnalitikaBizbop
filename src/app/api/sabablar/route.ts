/**
 * Miniapp uchun spisaniya sabablari (chip tugmalar) — faqat faol bo'lganlari.
 * Ro'yxat /chiqim/sabablar tabida boshqariladi. Boshqa miniapp endpointlari kabi
 * Telegram initData HMAC bilan himoyalangan.
 */
import { NextResponse } from "next/server";
import { sabablarFaol } from "@/lib/spisaniya/db";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!rateLimit(`sabablar:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov" }, { status: 429 });
  }
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  try {
    const sabablar = await sabablarFaol();
    return NextResponse.json(sabablar);
  } catch (err) {
    console.error("[api/sabablar]", err instanceof Error ? err.message : err);
    return NextResponse.json({ xato: "Server xatosi" }, { status: 500 });
  }
}
