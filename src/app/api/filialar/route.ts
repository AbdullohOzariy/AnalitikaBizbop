/**
 * Miniapp uchun aktiv filial nomlari (auth shart emas — Telegram miniapp o'qiydi).
 */
import { NextResponse } from "next/server";
import { aktivFilialNomlari } from "@/lib/spisaniya/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
