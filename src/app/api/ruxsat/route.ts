/**
 * Miniapp ochilganda foydalanuvchi ruxsatini tekshiradi (initData imzosi orqali).
 * { allowed, user: { id, ism } } qaytaradi — ruxsat yo'q bo'lsa miniapp "ruxsat oling"
 * ekranini ko'rsatadi.
 */
import { NextResponse } from "next/server";
import { ruxsatBormi } from "@/lib/spisaniya/db";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { sverkaRuxsatBormi } from "@/lib/sverka/ruxsat";
import { driverRuxsatBormi } from "@/lib/logistika/ruxsat";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`ruxsat:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ allowed: false, user: null }, { status: 429 });
  }
  const initData = req.headers.get("x-telegram-init-data") || "";
  const user = verifyInitData(initData);
  if (!user) {
    return NextResponse.json(
      { allowed: false, sverka: false, driver: false, user: null },
      { status: 200 }
    );
  }
  const [allowed, sverka, driver] = await Promise.all([
    ruxsatBormi(user.id),
    sverkaRuxsatBormi(user.id).catch(() => false),
    driverRuxsatBormi(user.id).catch(() => false),
  ]);
  const ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
  return NextResponse.json({ allowed, sverka, driver, user: { id: user.id, ism } });
}
