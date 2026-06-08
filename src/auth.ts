import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
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
    // Rolni HAR sessiyada DB'dan qayta o'qiymiz — rol pasaytirilsa/o'chirilsa
    // darhol kuchga kiradi (eskirgan JWT token'ga ishonmaymiz). O'chirilgan
    // foydalanuvchi VIEWER (huquqsiz) bo'lib qoladi — hamma joydan bloklanadi.
    session: async ({ session, token }) => {
      if (token?.id && session.user) {
        session.user.id = token.id as string;
        const dbUser = await prisma.user.findUnique({
          where: { id: Number(token.id) },
          select: { role: true },
        });
        session.user.role = (dbUser?.role ?? "VIEWER") as Role;
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
        };
      },
    }),
  ],
});
