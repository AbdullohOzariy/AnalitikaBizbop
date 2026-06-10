"use client";

/**
 * Joriy yil — klient soatidan. /login statik prerender bo'ladi, shuning uchun
 * RSC'dagi new Date().getFullYear() build vaqtidagi yilda qotib qolardi.
 * suppressHydrationWarning: server (build yili) va klient farqlansa klient yutadi.
 */
export function CurrentYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>;
}
