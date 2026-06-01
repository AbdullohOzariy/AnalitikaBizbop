"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

// In-memory token bucket: har IP uchun 5 urinish / 15 daqiqa
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
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  if (!checkRateLimit(ip)) {
    return { error: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring." };
  }

  try {
    await signIn("credentials", {
      email: input.login,
      password: input.password,
      redirect: false,
    });
    return { redirectTo: input.callbackUrl ?? "/dashboard" };
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
