/** Sverka Mini App ochilganda rol tekshiruvi (initData imzosi + SverkaXodim). */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { sverkaRuxsatBormi } from "@/lib/sverka/ruxsat";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";
import { logAccessEvent, touchAccess } from "@/lib/access-log/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`sverka-r:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ allowed: false, user: null }, { status: 429 });
  }
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) {
    logAccessEvent({
      surface: "BOT_SVERKA",
      type: "LOGIN_FAIL",
      reason: "BAD_SIGNATURE",
      route: "/api/sverka/ruxsat",
      throttle: { key: clientIp(req), ms: 10 * 60_000 },
    });
    return NextResponse.json({ allowed: false, user: null }, { status: 200 });
  }
  const allowed = await sverkaRuxsatBormi(user.id);
  const ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
  if (allowed) {
    touchAccess({
      surface: "BOT_SVERKA",
      tgUserId: user.id,
      actorName: ism,
      route: "/api/sverka/ruxsat",
      openEvent: "LOGIN_OK",
    });
  } else {
    logAccessEvent({
      surface: "BOT_SVERKA",
      type: "DENIED",
      reason: "NOT_WHITELISTED",
      tgUserId: user.id,
      actorName: ism,
      route: "/api/sverka/ruxsat",
      throttle: { key: String(user.id), ms: 60 * 60_000 },
    });
  }
  return NextResponse.json({ allowed, user: { id: user.id, ism } });
}
