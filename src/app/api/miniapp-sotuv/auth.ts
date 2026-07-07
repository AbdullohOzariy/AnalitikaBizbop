/**
 * BizbopSotuv Mini App — umumiy autentifikatsiya zanjiri:
 *   1) Telegram initData imzosi (HMAC, verifyInitData) → soxta so'rov o'tmaydi;
 *   2) rate-limit (Telegram user id bo'yicha);
 *   3) User.telegramId orqali platforma foydalanuvchisi (rol + filial qamrovi).
 * Route emas — miniapp-sotuv route'lari ichida ishlatiladigan yordamchi.
 */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { userByTelegramId } from "@/lib/user-branches";
import { rateLimit } from "@/lib/spisaniya/rate-limit";

export type MiniappUser = NonNullable<Awaited<ReturnType<typeof userByTelegramId>>>;

/** Xato JSON javobi (miniapp client `xato` maydonini o'qiydi). */
export function miniappXato(msg: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, xato: msg }, { status });
}

/**
 * initData tekshiruvi + rate-limit + platforma foydalanuvchisi.
 * Muvaffaqiyat: `{ user }`; aks holda `{ fail }` — tayyor NextResponse (401/403/429).
 */
// BizbopSotuv o'z boti bilan ochiladi: SOTUV_BOT_TOKEN o'rnatilsa o'sha bot bilan
// tekshiriladi, aks holda mavjud BOT_TOKEN'ga qaytadi (dastlab/test uchun).
const SOTUV_BOT_TOKEN = process.env.SOTUV_BOT_TOKEN || process.env.BOT_TOKEN;

export async function authMiniapp(
  req: Request,
  rlKey: string,
  rlLimit = 60
): Promise<{ user: MiniappUser } | { fail: NextResponse }> {
  const tgUser = verifyInitData(req.headers.get("x-telegram-init-data") || "", 3600, SOTUV_BOT_TOKEN);
  if (!tgUser) {
    console.warn("[miniapp-sotuv] initData imzosi tekshirilmadi (noto'g'ri bot yoki eskirgan)");
    return { fail: miniappXato("Telegram imzosi tekshirilmadi. Mini app'ni BizbopSotuv bot menyusidan oching.", 401) };
  }

  if (!rateLimit(`msotuv-${rlKey}:${tgUser.id}`, rlLimit, 60_000)) {
    return { fail: miniappXato("Juda ko'p so'rov. Birozdan keyin urinib ko'ring.", 429) };
  }

  const user = await userByTelegramId(tgUser.id);
  if (!user) {
    console.warn(`[miniapp-sotuv] telegramId topilmadi: ${tgUser.id}`);
    return { fail: miniappXato(`Sizning Telegram ID (${tgUser.id}) tizimga ulanmagan. Shu ID'ni administratorga yuboring.`, 403) };
  }
  return { user };
}

/** Filial foydalanuvchi qamrovidami (null = cheklovsiz). */
export function branchInScope(branchIds: number[] | null, branchId: number): boolean {
  return branchIds === null || branchIds.includes(branchId);
}
