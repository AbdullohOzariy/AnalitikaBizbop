import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Edge-safe config (DB / Node-only modules import qilinmaydi).
// To'liq config (Credentials provider bilan birga) src/auth.ts da kengaytirilgan.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized: ({ auth, request: { nextUrl } }) => {
      const { pathname } = nextUrl;
      const isLoggedIn = !!auth?.user;

      // Public (auth shart emas): NextAuth, Telegram webhook, miniapp (static + API).
      // Bular Telegram tomonidan / sessiyasiz chaqiriladi — login'ga yo'naltirib bo'lmaydi.
      const isPublic =
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/tg") ||
        pathname.startsWith("/api/yozuv") ||
        pathname.startsWith("/api/filialar") ||
        pathname.startsWith("/api/rasm-yukla") ||
        pathname.startsWith("/api/ruxsat") ||
        pathname.startsWith("/miniapp");
      if (isPublic) return true;

      const isOnLogin = pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) {
          const role = (auth as { user?: { role?: string } })?.user?.role;
          const dest = role === "CAT_MANAGER" ? "/dashboard-v2" : "/dashboard";
          return Response.redirect(new URL(dest, nextUrl));
        }
        return true;
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
