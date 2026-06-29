import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
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
        const r = await getUserRoles(Number(token.id));
        session.user.role = (r?.role ?? "VIEWER") as Role;
        session.user.roles = r?.roles ?? (["VIEWER"] as Role[]);
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
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

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
