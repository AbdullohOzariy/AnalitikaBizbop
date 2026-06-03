/**
 * Telegram WebApp `initData` imzosini tekshirish (HMAC-SHA256).
 * Miniapp `x-telegram-init-data` header'ida imzolangan satrni yuboradi —
 * shu satr BOT_TOKEN bilan tasdiqlangandagina foydalanuvchi haqiqiy hisoblanadi.
 * Bu xodim_id'ni soxtalashtirishning oldini oladi (whitelist xavfsizligi uchun).
 */
import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

/**
 * initData'ni tekshiradi. To'g'ri imzo bo'lsa foydalanuvchini, aks holda null qaytaradi.
 * @param maxAgeSec — auth_date eskirgan bo'lsa rad etiladi (default 24 soat).
 */
export function verifyInitData(initData: string, maxAgeSec = 21600): TelegramUser | null {
  const token = process.env.BOT_TOKEN;
  if (!token || !initData) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;

  // data_check_string: 'hash'dan tashqari barcha kalit=qiymat, alifbo tartibida, \n bilan.
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Doimiy vaqtli taqqoslash
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // Eskirganini tekshirish — auth_date majburiy (yo'q yoki 0 bo'lsa rad etamiz).
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || !Number.isFinite(authDate)) return null;
  if (maxAgeSec > 0 && Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw) as TelegramUser;
    return typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}
