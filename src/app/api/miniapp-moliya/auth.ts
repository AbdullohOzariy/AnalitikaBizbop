/**
 * Moliya Mini App — autentifikatsiya zanjiri (miniapp-sotuv naqshi):
 *   1) Telegram initData imzosi (HMAC) → soxta so'rov o'tmaydi;
 *   2) rate-limit (Telegram user id bo'yicha);
 *   3) User.telegramId + canEnterCash → platforma foydalanuvchisi va hisob qamrovi.
 *
 * Route emas — miniapp-moliya route'lari ichida ishlatiladigan yordamchi.
 */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";
import { logAccessEvent, touchAccess } from "@/lib/access-log/log";
import { moliyaUserByTelegramId, type MoliyaMiniappUser } from "@/lib/moliya/ruxsat";

export function moliyaXato(msg: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, xato: msg }, { status });
}

export async function authMoliya(
  req: Request,
  rlKey: string,
  rlLimit = 60
): Promise<{ user: MoliyaMiniappUser } | { fail: NextResponse }> {
  const yol = `/api/miniapp-moliya/${rlKey}`;
  const tgUser = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!tgUser) {
    logAccessEvent({
      surface: "BOT_KIRISH",
      type: "LOGIN_FAIL",
      reason: "BAD_SIGNATURE",
      route: yol,
      throttle: { key: clientIp(req), ms: 10 * 60_000 },
    });
    return { fail: moliyaXato("Telegram imzosi tekshirilmadi. Mini app'ni bot menyusidan oching.", 401) };
  }

  if (!rateLimit(`mmoliya-${rlKey}:${tgUser.id}`, rlLimit, 60_000)) {
    logAccessEvent({
      surface: "BOT_KIRISH",
      type: "BLOCKED",
      reason: "RATE_LIMIT",
      tgUserId: tgUser.id,
      route: yol,
      throttle: { key: String(tgUser.id), ms: 10 * 60_000 },
    });
    return { fail: moliyaXato("Juda ko'p so'rov. Birozdan keyin urinib ko'ring.", 429) };
  }

  // DB xatosini "ruxsat yo'q" ga AYLANTIRMAYMIZ — Neon idle uzilishida xodim
  // chiqib bo'lmaydigan "ruxsat yo'q" ekraniga tushmasin (/api/ruxsat naqshi).
  let user: MoliyaMiniappUser | null;
  try {
    user = await moliyaUserByTelegramId(tgUser.id);
  } catch {
    return { fail: moliyaXato("Ulanib bo'lmadi. Qayta urinib ko'ring.", 503) };
  }

  if (!user) {
    logAccessEvent({
      surface: "BOT_KIRISH",
      type: "DENIED",
      reason: "NOT_WHITELISTED",
      tgUserId: tgUser.id,
      route: yol,
      throttle: { key: String(tgUser.id), ms: 60 * 60_000 },
    });
    return {
      fail: moliyaXato(
        `Telegram ID (${tgUser.id}) moliya huquqiga ulanmagan. Shu ID'ni administratorga yuboring.`,
        403
      ),
    };
  }

  touchAccess({ surface: "WEB", userId: user.id, actorName: user.name, route: yol });
  return { user };
}
