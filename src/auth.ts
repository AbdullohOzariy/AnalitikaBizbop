import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { logAccessEvent, startAccessSession } from "@/lib/access-log/log";
import { clientIp } from "@/lib/spisaniya/rate-limit";
import { clearLoginAttempts, consumeLoginAttempt } from "@/lib/login-rate-limit";
import type { Role } from "@/generated/prisma/enums";

/** Rol o'zgartirilganda/foydalanuvchi o'chirilganda invalidatsiya qilinadigan tag. */
export const USER_ROLES_TAG = "user-roles";

// Rol tekshiruvi HAR sahifa renderida (layout + page) yuradi — bu kritik yo'ldagi
// DB so'rovi edi. 60s kesh + USER_ROLES_TAG: admin rolni o'zgartirsa users-action
// tag'ni darhol invalidatsiya qiladi; DB'ga to'g'ridan-to'g'ri o'zgartirish kiritilsa
// ham eng ko'pi 60 soniyada kuchga kiradi.
// Asosiy rol + qo'shimcha rollar — union (role + extraRoles, dublikatsiz). Ruxsat shu
// to'plam bo'yicha tekshiriladi; `role` esa asosiy (default sahifa) sifatida qoladi.
const getUserRoles = (userId: number) =>
  unstable_cache(
    async (): Promise<{ role: Role; roles: Role[] } | null> => {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, extraRoles: true },
      });
      if (!dbUser) return null;
      return { role: dbUser.role, roles: [...new Set<Role>([dbUser.role, ...dbUser.extraRoles])] };
    },
    ["userRoles", String(userId)],
    { tags: [USER_ROLES_TAG], revalidate: 60 }
  )();

/** DB ulanish xatosimi (Neon hiccup/timeout) — faqat shularda JWT fallback qilinadi. */
const isDbConnError = (e: unknown) => {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /P10\d\d|connect|connection|control plane|timeout|econn|socket|terminated/i.test(m);
};

/** Neon hiccup'lari ko'pincha sub-soniya — fallback'dan oldin bitta qisqa retry. */
async function getUserRolesRetry(userId: number) {
  try {
    return await getUserRoles(userId);
  } catch (err) {
    if (!isDbConnError(err)) throw err;
    await new Promise((res) => setTimeout(res, 150));
    return getUserRoles(userId);
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role; // asosiy rol (default sahifa)
      roles: Role[]; // barcha rollar (union) — ruxsat tekshiruvi shu bo'yicha
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    roles: Role[];
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().min(1), // login — email bo'lishi shart emas
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Rol DB'dan o'qiladi (eskirgan JWT'ga ishonmaymiz) — lekin 60s kesh bilan
    // (getUserRole izohi). O'chirilgan foydalanuvchi VIEWER (huquqsiz) bo'lib qoladi.
    session: async ({ session, token }) => {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
        try {
          const r = await getUserRolesRetry(Number(token.id));
          session.user.role = (r?.role ?? "VIEWER") as Role;
          session.user.roles = r?.roles ?? (["VIEWER"] as Role[]);
        } catch (err) {
          if (isDbConnError(err)) {
            // DB vaqtincha yiqilsa (Neon hiccup) sessiyani O'LDIRMAYMIZ — login paytida
            // JWT'ga imzolanib yozilgan rollarga tushamiz (token maxAge 12h). O'chirilgan/
            // rolsiz user baribir VIEWER (u DB null qaytargan yo'l — exception emas).
            // DB tiklangach keyingi so'rovda rol yana DB'dan yangilanadi (kesh xatoni saqlamaydi).
            console.error("[auth] rol o'qishda DB ulanish xatosi — JWT fallback:", err);
            session.user.role = ((token.role as Role | undefined) ?? "VIEWER") as Role;
            session.user.roles = (token.roles as Role[] | undefined) ?? [session.user.role];
          } else {
            // Kutilmagan xato (bug/schema) — fail-closed: huquqsiz VIEWER + baland log.
            console.error("[auth] rol o'qishda KUTILMAGAN xato — VIEWER fail-closed:", err);
            session.user.role = "VIEWER" as Role;
            session.user.roles = ["VIEWER"] as Role[];
          }
        }
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Login", type: "text" },
        password: { label: "Parol", type: "password" },
      },
      authorize: async (raw, request) => {
        // Kirishlar jurnali (Tizim → Kirishlar). HAR BIR chaqiruv fire-and-forget:
        // jurnal DB'si yiqilsa ham login ishlayveradi (src/lib/access-log/log.ts).
        // Kiritilgan LOGIN satri yoziladi — PAROL hech qachon.
        //
        // Bu yerda per-kalit throttle ATAYLAB yo'q (login satri hujumchi qo'lida —
        // kalitga qo'shilsa throttle aylanib o'tilardi). Yozuv toshqinini
        // log.ts dagi GLOBAL shift to'sadi.
        const login =
          typeof (raw as { email?: unknown })?.email === "string"
            ? (raw as { email: string }).email.trim().slice(0, 120)
            : null;

        // ── BRUTE-FORCE CHEKLOVI — YAGONA CHOKE POINT ──────────────────────
        // Bu tekshiruv SHU YERDA turishi SHART. Ilgari u faqat /login server
        // action'ida edi, lekin `POST /api/auth/callback/credentials` (NextAuth
        // o'z handler'i, src/auth-handler.ts) action'ni chetlab o'tib to'g'ridan-
        // to'g'ri shu funksiyani chaqiradi — ya'ni parol tanlash cheklanmagan edi.
        // Ikkala yo'l ham `authorize` dan o'tadi, shuning uchun hisob shu yerda.
        //
        // `request` — @auth/core asl header'lar bilan yasagan Request
        // (callback/index.js:231; server-action yo'lida next-auth/lib/actions.js
        // `new Headers(await nextHeaders())` ni to'liq uzatadi), demak IP ishonchli.
        //
        // Tekshiruv bcrypt'dan OLDIN: bcrypt.compare ataylab qimmat (~100ms CPU),
        // ya'ni uning o'zi ham DoS vektori.
        const ip = request ? clientIp(request) : "unknown";
        if (!consumeLoginAttempt(ip, login ?? "")) {
          logAccessEvent({
            surface: "WEB",
            type: "BLOCKED",
            reason: "RATE_LIMIT",
            login,
            route: "/api/auth/callback/credentials",
            throttle: { key: ip, ms: 15 * 60_000 },
          });
          return null;
        }

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          logAccessEvent({ surface: "WEB", type: "LOGIN_FAIL", reason: "BAD_INPUT", login });
          return null;
        }
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          logAccessEvent({ surface: "WEB", type: "LOGIN_FAIL", reason: "NO_USER", login });
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          logAccessEvent({
            surface: "WEB",
            type: "LOGIN_FAIL",
            reason: "BAD_PASSWORD",
            login,
            userId: user.id,
            actorName: user.name,
          });
          return null;
        }

        // Halol foydalanuvchi limitga tiqilib qolmasin (bir necha marta kirsa ham).
        clearLoginAttempts(ip, login ?? "");

        logAccessEvent({
          surface: "WEB",
          type: "LOGIN_OK",
          userId: user.id,
          actorName: user.name,
        });
        // Login = MAJBURAN yangi sessiya (mavjud oynani uzaytirmaydi) — aks holda
        // 30 daqiqa ichida qayta kirgan xodim jurnalda ko'rinmay qolardi.
        startAccessSession({ surface: "WEB", userId: user.id, actorName: user.name });

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          roles: [...new Set<Role>([user.role, ...user.extraRoles])],
        };
      },
    }),
  ],
});
