/**
 * Miniapp ochilganda foydalanuvchi ruxsatini tekshiradi (initData imzosi orqali).
 * { allowed, user: { id, ism } } qaytaradi — ruxsat yo'q bo'lsa miniapp "ruxsat oling"
 * ekranini ko'rsatadi.
 */
import { NextResponse } from "next/server";
import { ruxsatBormi } from "@/lib/spisaniya/db";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const initData = req.headers.get("x-telegram-init-data") || "";
  const user = verifyInitData(initData);
  if (!user) {
    return NextResponse.json({ allowed: false, user: null }, { status: 200 });
  }
  const allowed = await ruxsatBormi(user.id);
  const ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
  return NextResponse.json({ allowed, user: { id: user.id, ism } });
}
