"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { isLoginBlocked } from "@/lib/login-rate-limit";

/**
 * /login formasidan kirish.
 *
 * DIQQAT — urinishlar SHU YERDA HISOBLANMAYDI. Hisoblagich `authorize()` da
 * (src/auth.ts), chunki `POST /api/auth/callback/credentials` bu action'ni
 * butunlay chetlab o'tadi va faqat `authorize` ikkala yo'l uchun ham yagona
 * o'tish nuqtasi. Bu yerda faqat O'QIYMIZ (`isLoginBlocked`) — shunda bitta
 * urinish ikki marta sanalmaydi va foydalanuvchi to'g'ri xabarni ko'radi.
 */
const BLOK_XABARI = "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring.";

export async function signInAction(input: {
  login: string;
  password: string;
  callbackUrl?: string;
}): Promise<{ error?: string; redirectTo?: string }> {
  const hdrs = await headers();
  // XFF eng o'ng (ishonchli proxy qo'shgan) qiymati — chap qiymatlar spoof qilinishi mumkin.
  const xff = hdrs.get("x-forwarded-for");
  const ip = xff?.split(",").pop()?.trim() || hdrs.get("x-real-ip") || "unknown";

  // Allaqachon bloklangan bo'lsa — bekorga signIn chaqirmaymiz.
  if (isLoginBlocked(ip, input.login)) return { error: BLOK_XABARI };

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
    // Hisoblagichni `authorize` muvaffaqiyatda o'zi tozalaydi.
    return { redirectTo: safeRedirect };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        // Aynan shu urinish limitni to'ldirgan bo'lishi mumkin — u holda
        // "parol noto'g'ri" emas, blok xabarini ko'rsatamiz.
        return { error: isLoginBlocked(ip, input.login) ? BLOK_XABARI : "Login yoki parol noto'g'ri." };
      }
      return { error: "Kirish xatoligi yuz berdi." };
    }
    throw error;
  }
}
