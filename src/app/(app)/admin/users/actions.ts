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

const ROLE_VALUES = ["SYSTEM_ADMIN", "ADMIN", "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "MERCHANDISER", "OPERATOR"] as const;
const roleEnum = z.enum(ROLE_VALUES);

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(100), // login — email bo'lishi shart emas
  password: z.string().min(6, "Parol kamida 6 belgi"),
  role: roleEnum, // asosiy rol
  extraRoles: z.array(roleEnum).max(7).optional().default([]), // qo'shimcha rollar (union)
});

// Qo'shimcha rollarni normallashtirish: dublikatsiz va asosiy roldan tashqari.
function normExtraRoles(role: string, extraRoles: readonly string[]): Role[] {
  return [...new Set(extraRoles)].filter((r) => r !== role) as Role[];
}
// Foydalanuvchi (role + extraRoles) ichida berilgan rol bormi.
const includesRole = (role: string, extraRoles: readonly string[], target: string) =>
  role === target || extraRoles.includes(target);

// Oxirgi System Admin himoyasi tranzaksiya ichida ishlaydi — sentinel xato.
class LastAdminError extends Error {}
const SA_WHERE = { OR: [{ role: "SYSTEM_ADMIN" as Role }, { extraRoles: { has: "SYSTEM_ADMIN" as Role } }] };

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
        extraRoles: normExtraRoles(parsed.role, parsed.extraRoles),
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
  role: roleEnum,
  extraRoles: z.array(roleEnum).max(7).optional().default([]),
});

/** Foydalanuvchi ma'lumotlarini (nom, login, rol) tahrirlash — faqat System Admin. */
export async function updateUserAction(
  input: z.input<typeof updateSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    const p = updateSchema.parse(input);
    const extra = normExtraRoles(p.role, p.extraRoles);
    const willBeSA = p.role === "SYSTEM_ADMIN" || extra.includes("SYSTEM_ADMIN");
    // O'zini System Admin huquqidan ayirib, tizimni qulflab qo'ymasin
    if (Number(me.id) === p.id && !willBeSA) {
      return { ok: false, error: "O'z System Admin huquqingizni olib tashlay olmaysiz." };
    }
    // Login boshqa foydalanuvchida band emasligini tekshiramiz
    const taken = await prisma.user.findFirst({ where: { email: p.email, id: { not: p.id } } });
    if (taken) return { ok: false, error: "Bu login band." };

    const cur = await prisma.user.findUnique({ where: { id: p.id }, select: { role: true, extraRoles: true } });
    const wasSA = cur ? includesRole(cur.role, cur.extraRoles, "SYSTEM_ADMIN") : false;
    const wasCatMgr = cur ? includesRole(cur.role, cur.extraRoles, "CAT_MANAGER") : false;
    const willBeCatMgr = p.role === "CAT_MANAGER" || extra.includes("CAT_MANAGER");
    // Oxirgi SA tekshiruvi + mutatsiya bitta Serializable tranzaksiyada (TOCTOU poygasini oldini oladi).
    try {
      await prisma.$transaction(async (tx) => {
        if (wasSA && !willBeSA) {
          const saCount = await tx.user.count({ where: SA_WHERE });
          if (saCount <= 1) throw new LastAdminError("Oxirgi System Admin huquqini olib tashlab bo'lmaydi.");
        }
        await tx.user.update({
          where: { id: p.id },
          data: { name: p.name, email: p.email, role: p.role as Role, extraRoles: extra },
        });
        // CAT_MANAGER butunlay olib tashlansa — kategoriya biriktirishlari ortiqcha
        if (wasCatMgr && !willBeCatMgr) await tx.categoryManager.deleteMany({ where: { userId: p.id } });
      }, { isolationLevel: "Serializable" });
    } catch (e) {
      if (e instanceof LastAdminError) return { ok: false, error: e.message };
      throw e;
    }
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
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, extraRoles: true } });
    const wasSA = target ? includesRole(target.role, target.extraRoles, "SYSTEM_ADMIN") : false;
    // Oxirgi SA tekshiruvi + o'chirish bitta Serializable tranzaksiyada (TOCTOU poygasini oldini oladi).
    // Foydalanuvchi yuklagan fayllar (UploadedFile.uploadedById FK) joriy adminga qayta biriktiriladi.
    try {
      await prisma.$transaction(async (tx) => {
        if (wasSA) {
          const saCount = await tx.user.count({ where: SA_WHERE });
          if (saCount <= 1) throw new LastAdminError("Oxirgi System Admin'ni o'chirib bo'lmaydi.");
        }
        await tx.uploadedFile.updateMany({ where: { uploadedById: id }, data: { uploadedById: Number(me.id) } });
        await tx.user.delete({ where: { id } });
      }, { isolationLevel: "Serializable" });
    } catch (e) {
      if (e instanceof LastAdminError) return { ok: false, error: e.message };
      throw e;
    }
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
