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
import { moliyaRuxsatBormi } from "@/lib/moliya/ruxsat";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";
import { logAccessEvent, touchAccess } from "@/lib/access-log/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`ruxsat:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ allowed: false, user: null }, { status: 429 });
  }
  const initData = req.headers.get("x-telegram-init-data") || "";
  const user = verifyInitData(initData);
  if (!user) {
    // Imzo yaroqsiz — bu AUTENTIFIKATSIYADAN OLDINGI yo'l, ya'ni istalgan anonim
    // so'rov shu yerga tushadi. Throttle SHART: usiz jurnal yozuvi cheksiz
    // ko'paytirilib, DB pool'ini yeb, kirishning o'zini yiqitishi mumkin edi.
    logAccessEvent({
      surface: "BOT_KIRISH",
      type: "LOGIN_FAIL",
      reason: "BAD_SIGNATURE",
      route: "/api/ruxsat",
      throttle: { key: clientIp(req), ms: 10 * 60_000 },
    });
    return NextResponse.json(
      { allowed: false, sverka: false, driver: false, moliya: false, user: null },
      { status: 200 }
    );
  }
  // DB xatosini "ruxsat yo'q" ga AYLANTIRMAYMIZ. Ilgari uchala tekshiruv ham
  // .catch(() => false) bilan yutilardi — Neon idle uzilishida xodim "Ruxsat
  // yo'q — ID'ni adminga yuboring" terminal ekraniga tushardi va u yerdan
  // chiqa olmasdi. 503 esa miniappda "Ulanib bo'lmadi + Qayta urinish" beradi.
  let allowed: boolean, sverka: boolean, driver: boolean, moliya: boolean;
  try {
    [allowed, sverka, driver, moliya] = await Promise.all([
      ruxsatBormi(user.id),
      sverkaRuxsatBormi(user.id),
      driverRuxsatBormi(user.id),
      moliyaRuxsatBormi(user.id),
    ]);
  } catch {
    return NextResponse.json({ xato: "Ulanib bo'lmadi" }, { status: 503 });
  }
  const ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;

  // Kirishlar jurnali: miniapp ochilishi = kirish. Bir odam bir nechta bot
  // ro'yxatida bo'lishi mumkin — har biri o'z sessiyasini oladi.
  const asos = { tgUserId: user.id, actorName: ism, route: "/api/ruxsat" } as const;
  if (allowed) touchAccess({ ...asos, surface: "BOT_SPISANIYA", openEvent: "LOGIN_OK" });
  if (sverka) touchAccess({ ...asos, surface: "BOT_SVERKA", openEvent: "LOGIN_OK" });
  if (driver) touchAccess({ ...asos, surface: "BOT_LOGISTIKA", openEvent: "LOGIN_OK" });
  // Moliya uchun alohida AccessSurface yo'q — WEB sifatida yoziladi (u platforma
  // foydalanuvchisi, oq ro'yxat emas).
  if (moliya) touchAccess({ ...asos, surface: "WEB", openEvent: "LOGIN_OK" });
  if (!allowed && !sverka && !driver && !moliya) {
    // Ro'yxatda yo'q ID — adminlar uchun "kim ruxsat so'rayapti" signali.
    // Throttle: miniapp qayta-qayta ochilaverishi mumkin.
    logAccessEvent({
      ...asos,
      surface: "BOT_KIRISH",
      type: "DENIED",
      reason: "NOT_WHITELISTED",
      throttle: { key: String(user.id), ms: 60 * 60_000 },
    });
  }

  return NextResponse.json({ allowed, sverka, driver, moliya, user: { id: user.id, ism } });
}
