"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(6, "Parol kamida 6 belgi"),
  role: z.enum(["ADMIN", "VIEWER"]),
});

export async function createUserAction(
  input: z.input<typeof createSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const parsed = createSchema.parse(input);
    const exists = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (exists) return { ok: false, error: "Bu email band." };
    const passwordHash = await bcrypt.hash(parsed.password, 12);
    await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash,
        role: parsed.role as Role,
      },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}

export async function deleteUserAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    if (Number(me.id) === id) return { ok: false, error: "O'zingizni o'chira olmaysiz." };
    await prisma.user.delete({ where: { id } });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}

const passwordSchema = z.object({
  id: z.number().int().positive(),
  password: z.string().min(6),
});

export async function resetPasswordAction(
  input: z.input<typeof passwordSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const parsed = passwordSchema.parse(input);
    const passwordHash = await bcrypt.hash(parsed.password, 12);
    await prisma.user.update({
      where: { id: parsed.id },
      data: { passwordHash },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Xato." };
  }
}
