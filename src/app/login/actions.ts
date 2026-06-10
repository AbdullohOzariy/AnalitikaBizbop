"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

// In-memory token bucket: 5 urinish / 15 daqiqa — IP bo'yicha HAM, login bo'yicha HAM.
// Faqat IP kifoya emas: XFF spoof yoki ko'p IP'dan bitta akkauntga brute-force mumkin.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export async function signInAction(input: {
  login: string;
  password: string;
  callbackUrl?: string;
}): Promise<{ error?: string; redirectTo?: string }> {
  const hdrs = await headers();
  // XFF eng o'ng (ishonchli proxy qo'shgan) qiymati — chap qiymatlar spoof qilinishi mumkin.
  const xff = hdrs.get("x-forwarded-for");
  const ip = xff?.split(",").pop()?.trim() || hdrs.get("x-real-ip") || "unknown";

  const ipKey = `ip:${ip}`;
  const loginKey = `login:${input.login.trim().toLowerCase()}`;
  // Ikkalasi ham hisoblansin (qisqa tutashuv bo'lmasin), keyin tekshiramiz.
  const ipOk = checkRateLimit(ipKey);
  const loginOk = checkRateLimit(loginKey);
  if (!ipOk || !loginOk) {
    return { error: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring." };
  }

  // Open-redirect himoyasi: faqat ichki (nisbiy) yo'lga ruxsat.
  // "//evil.com" yoki "https://evil.com" kabi tashqi manzillar rad etiladi.
  const cb = input.callbackUrl;
  const safeRedirect =
    cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/dashboard";

  try {
    await signIn("credentials", {
      email: input.login,
      password: input.password,
      redirect: false,
    });
    // Muvaffaqiyatli kirish — hisoblagichlarni tozalaymiz (halol foydalanuvchi
    // qayta-qayta kirsa limitga tiqilib qolmasin).
    attempts.delete(ipKey);
    attempts.delete(loginKey);
    return { redirectTo: safeRedirect };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Login yoki parol noto'g'ri." };
      }
      return { error: "Kirish xatoligi yuz berdi." };
    }
    throw error;
  }
}
