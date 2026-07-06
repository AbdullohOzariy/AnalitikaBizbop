/**
 * Miniapp uchun aktiv filial nomlari. Boshqa miniapp endpointlari kabi Telegram
 * initData HMAC bilan himoyalangan (ilgari butunlay ochiq edi — enumeration).
 */
import { NextResponse } from "next/server";
import { aktivFilialNomlari } from "@/lib/spisaniya/db";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!rateLimit(`filialar:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov" }, { status: 429 });
  }
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  try {
    const filialar = await aktivFilialNomlari();
    // Miniapp shu host'dan (WEBHOOK_URL) ochiladi — so'rov same-origin, wildcard CORS shart emas.
    return NextResponse.json(filialar);
  } catch (err) {
    console.error("[api/filialar]", err instanceof Error ? err.message : err);
    return NextResponse.json({ xato: "Server xatosi" }, { status: 500 });
  }
}
