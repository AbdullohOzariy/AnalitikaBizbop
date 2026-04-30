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
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isOnAuthApi = nextUrl.pathname.startsWith("/api/auth");

      if (isOnAuthApi) return true;
      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
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
