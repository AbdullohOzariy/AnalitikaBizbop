/** Sverka Mini App ochilganda rol tekshiruvi (initData imzosi + SverkaXodim). */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { sverkaRuxsatBormi } from "@/lib/sverka/ruxsat";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`sverka-r:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ allowed: false, user: null }, { status: 429 });
  }
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ allowed: false, user: null }, { status: 200 });
  const allowed = await sverkaRuxsatBormi(user.id);
  const ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
  return NextResponse.json({ allowed, user: { id: user.id, ism } });
}
