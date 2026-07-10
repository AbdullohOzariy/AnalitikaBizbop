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
        "/api/health", // Railway healthcheck — sessiyasiz

        "/api/tg",
        "/api/yozuv",
        "/api/vozvrat",
        "/api/filialar",
        "/api/rasm-yukla",
        "/api/ruxsat",
        "/api/import", // 1C avto sotuv importi — IMPORT_TOKEN bilan himoyalangan (sessiyasiz)
        "/api/miniapp-sotuv", // BizbopSotuv mini app — initData HMAC + User.telegramId bilan himoyalangan
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
              : role === "INVENTORY"
              ? "/sotuv-dashboard"
              : role === "CAT_MANAGER" || role === "SUPPLYCHAIN" || role === "HEAD_CAT_MANAGER"
              ? "/dashboard-v2"
              : "/dashboard";
          return Response.redirect(new URL(dest, request.nextUrl));
        }
        return true;
      }
      // IZOLATSIYA (ko'p-rol): faqat foydalanuvchining BARCHA rollari izolatsiyalangan
      // bo'lsa cheklov qoladi. Bittasi ham normal rol bo'lsa — to'liq kirish (union).
      // MERCHANDISER → /promo (+/api/promo); OPERATOR → /chiqim,/sverka (+/api/*).
      // Ikki izolatsiyalangan rol birga bo'lsa — ruxsat etilgan yo'llar birlashadi.
      if (isLoggedIn) {
        const u = (auth as { user?: { role?: string; roles?: string[] } })?.user;
        const roles = u?.roles ?? (u?.role ? [u.role] : []);
        const ISOLATED = new Set(["MERCHANDISER", "OPERATOR", "INVENTORY"]);
        const allIsolated = roles.length > 0 && roles.every((r) => ISOLATED.has(r));
        if (allIsolated) {
          const allowed: string[] = [];
          if (roles.includes("MERCHANDISER")) allowed.push("/promo", "/api/promo");
          if (roles.includes("OPERATOR")) allowed.push("/chiqim", "/sverka", "/api/chiqim", "/api/sverka");
          // INVENTORY qo'shimcha Baza→Sotuv'ni to'liq ko'radi (read-only sahifa + Excel eksport).
          // Faqat "/baza/sotuv" — Baza'ning boshqa bo'limlari (qoldiq/tashrif/...) yopiq qoladi.
          if (roles.includes("INVENTORY")) allowed.push("/sotuv-dashboard", "/inventarizatsiya", "/baza/sotuv", "/api/baza/sotuv");
          const ok = allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
          if (!ok) {
            const dest = roles.includes("MERCHANDISER")
              ? "/promo/doimiy"
              : roles.includes("OPERATOR")
              ? "/chiqim"
              : "/sotuv-dashboard";
            return Response.redirect(new URL(dest, request.nextUrl));
          }
        }
      }

      // Hamma boshqa route'lar uchun login talab qilinadi.
      return isLoggedIn;
    },
    jwt: ({ token, user }) => {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
        const r = (user as { roles?: string[] }).roles;
        token.roles = r ?? [(user as { role: string }).role];
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.roles = (token.roles as Role[] | undefined) ?? [token.role as Role];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
