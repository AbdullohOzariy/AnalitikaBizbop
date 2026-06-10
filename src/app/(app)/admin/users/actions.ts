"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { USER_ROLES_TAG } from "@/auth";
import { CAT_SCOPE_TAG } from "@/lib/scope";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(100), // login — email bo'lishi shart emas
  password: z.string().min(6, "Parol kamida 6 belgi"),
  role: z.enum(["SYSTEM_ADMIN", "ADMIN", "CAT_MANAGER", "CEO"]),
});

/** Foydalanuvchiga (kategoriya menejeri) javobgar kategoriyalarni biriktiradi. */
export async function setUserCategoriesAction(
  userId: number,
  categoryIds: number[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const uid = z.coerce.number().int().positive().parse(userId);
    const ids = z.array(z.coerce.number().int().positive()).parse(categoryIds);
    await prisma.$transaction([
      prisma.categoryManager.deleteMany({ where: { userId: uid } }),
      ...(ids.length > 0
        ? [prisma.categoryManager.createMany({
            data: ids.map((categoryId) => ({ userId: uid, categoryId })),
            skipDuplicates: true,
          })]
        : []),
    ]);
    revalidatePath("/admin/users");
    // Menejer qamrovi o'zgardi — scope keshlari darhol yangilansin
    revalidateTag(CAT_SCOPE_TAG, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "setUserCategories");
  }
}

export async function createUserAction(
  input: z.input<typeof createSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const parsed = createSchema.parse(input);
    const exists = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (exists) return { ok: false, error: "Bu login band." };
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
    return actionError(err, "users");
  }
}

const updateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(100),
  role: z.enum(["SYSTEM_ADMIN", "ADMIN", "CAT_MANAGER", "CEO"]),
});

/** Foydalanuvchi ma'lumotlarini (nom, login, rol) tahrirlash — faqat System Admin. */
export async function updateUserAction(
  input: z.input<typeof updateSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    const p = updateSchema.parse(input);
    // O'zini System Admin'dan tushirib, tizimni qulflab qo'ymasin
    if (Number(me.id) === p.id && p.role !== "SYSTEM_ADMIN") {
      return { ok: false, error: "O'z rolingizni System Admin'dan o'zgartira olmaysiz." };
    }
    // Login boshqa foydalanuvchida band emasligini tekshiramiz
    const taken = await prisma.user.findFirst({ where: { email: p.email, id: { not: p.id } } });
    if (taken) return { ok: false, error: "Bu login band." };

    const cur = await prisma.user.findUnique({ where: { id: p.id }, select: { role: true } });
    // Oxirgi System Admin'ni pasaytirib tizimni adminsiz qoldirmaslik
    if (cur?.role === "SYSTEM_ADMIN" && p.role !== "SYSTEM_ADMIN") {
      const saCount = await prisma.user.count({ where: { role: "SYSTEM_ADMIN" } });
      if (saCount <= 1) return { ok: false, error: "Oxirgi System Admin'ni pasaytirib bo'lmaydi." };
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: p.id },
        data: { name: p.name, email: p.email, role: p.role as Role },
      }),
      // Rol CAT_MANAGER'dan boshqaga o'zgarsa — kategoriya biriktirishlari ortiqcha
      ...(cur?.role === "CAT_MANAGER" && p.role !== "CAT_MANAGER"
        ? [prisma.categoryManager.deleteMany({ where: { userId: p.id } })]
        : []),
    ]);
    revalidatePath("/admin/users");
    // Rol o'zgardi — auth() dagi 60s rol keshi darhol yangilansin
    revalidateTag(USER_ROLES_TAG, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "users");
  }
}

export async function deleteUserAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    if (Number(me.id) === id) return { ok: false, error: "O'zingizni o'chira olmaysiz." };
    // Oxirgi System Admin'ni o'chirib tizimni adminsiz qoldirmaslik
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "SYSTEM_ADMIN") {
      const saCount = await prisma.user.count({ where: { role: "SYSTEM_ADMIN" } });
      if (saCount <= 1) return { ok: false, error: "Oxirgi System Admin'ni o'chirib bo'lmaydi." };
    }
    // Foydalanuvchi yuklagan fayllar UploadedFile.uploadedById orqali bog'langan (FK).
    // O'chirishdan oldin ularni joriy adminga qayta biriktiramiz (ma'lumot saqlanadi).
    await prisma.$transaction([
      prisma.uploadedFile.updateMany({
        where: { uploadedById: id },
        data: { uploadedById: Number(me.id) },
      }),
      prisma.user.delete({ where: { id } }),
    ]);
    revalidatePath("/admin/users");
    // O'chirilgan foydalanuvchi sessiyasi keyingi tekshiruvda VIEWER bo'lib qolsin
    revalidateTag(USER_ROLES_TAG, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "users");
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
    return actionError(err, "users");
  }
}
