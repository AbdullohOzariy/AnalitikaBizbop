import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Edge-safe config (DB / Node-only modules import qilinmaydi).
// To'liq config (Credentials provider bilan birga) src/auth.ts da kengaytirilgan.
export const authConfig = {
  pages: { signIn: "/login" },
  // maxAge: default 30 kun o'rniga 12 soat — token o'g'irlansa amal qilish oynasi qisqa.
  // (Rol baribir har so'rovda DB'dan qayta o'qiladi — src/auth.ts session callback.)
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized: ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      // supplier.* subdomeni — to'liq public (faqat anketa ko'rinadi, proxy rewrite qiladi)
      const host = request.headers.get("host") ?? "";
      if (host.startsWith("supplier.")) return true;

      // Public (auth shart emas): NextAuth, Telegram webhook, miniapp (static + API).
      // Bular Telegram tomonidan / sessiyasiz chaqiriladi — login'ga yo'naltirib bo'lmaydi.
      // Aniq segment moslik: faqat o'zi yoki "<prefix>/..." (masalan /api/yozuvlar OCHILMAYDI).
      const PUBLIC_PREFIXES = [
        "/api/auth",
        "/api/tg",
        "/api/yozuv",
        "/api/vozvrat",
        "/api/filialar",
        "/api/rasm-yukla",
        "/api/ruxsat",
        "/api/sverka", // sverka mini app API'lari — o'zi initData HMAC + SverkaXodim bilan himoyalangan
        "/miniapp",
        "/anketa", // yetkazib beruvchi anketasi — public forma
      ];
      const isPublic = PUBLIC_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (isPublic) return true;

      const isOnLogin = pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) {
          const role = (auth as { user?: { role?: string } })?.user?.role;
          const dest =
            role === "MERCHANDISER"
              ? "/promo/doimiy"
              : role === "OPERATOR"
              ? "/chiqim"
              : role === "CAT_MANAGER" || role === "SUPPLYCHAIN" || role === "HEAD_CAT_MANAGER"
              ? "/dashboard-v2"
              : "/dashboard";
          return Response.redirect(new URL(dest, request.nextUrl));
        }
        return true;
      }
      // MERCHANDISER izolatsiyasi: /promo tashqarisidagi har qanday sahifada
      // /promo/doimiy ga yo'naltiriladi — cheksiz loop oldini oladi.
      if (isLoggedIn) {
        const role = (auth as { user?: { role?: string } })?.user?.role;
        if (role === "MERCHANDISER" && !pathname.startsWith("/promo")) {
          return Response.redirect(new URL("/promo/doimiy", request.nextUrl));
        }
        // OPERATOR izolatsiyasi: faqat /chiqim va /sverka — boshqasidan /chiqim ga
        if (role === "OPERATOR" && !pathname.startsWith("/chiqim") && !pathname.startsWith("/sverka")) {
          return Response.redirect(new URL("/chiqim", request.nextUrl));
        }
      }

      // Hamma boshqa route'lar uchun login talab qilinadi.
      return isLoggedIn;
    },
    jwt: ({ token, user }) => {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
