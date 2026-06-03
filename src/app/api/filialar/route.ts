/**
 * Miniapp uchun aktiv filial nomlari (auth shart emas — Telegram miniapp o'qiydi).
 */
import { NextResponse } from "next/server";
import { aktivFilialNomlari } from "@/lib/spisaniya/db";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!rateLimit(`filialar:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov" }, { status: 429 });
  }
  try {
    const filialar = await aktivFilialNomlari();
    return NextResponse.json(filialar, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("[api/filialar]", err instanceof Error ? err.message : err);
    return NextResponse.json({ xato: "Server xatosi" }, { status: 500 });
  }
}
