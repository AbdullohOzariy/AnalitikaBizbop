import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export class AuthorizationError extends Error {
  constructor(message = "Ruxsat yo'q") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// "requireAdmin" = to'liq admin (SYSTEM_ADMIN). Read-only ADMIN bu yerdan o'tmaydi.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SYSTEM_ADMIN") {
    throw new AuthorizationError();
  }
  return session.user;
}

/**
 * Admin + sessiyadagi foydalanuvchi BAZADA haqiqatan mavjudligini tasdiqlaydi.
 * Eskirgan JWT (foydalanuvchi o'chirilgan/qayta yaratilgan, baza qayta seed qilingan)
 * holatida FK xatosi (UploadedFile_uploadedById_fkey) o'rniga tushunarli xabar beradi.
 * Yozuv yaratishda uploadedById uchun shu funksiya qaytargan user.id ishlatilsin.
 */
export async function requireAdminUser() {
  const sessionUser = await requireAdmin();
  const id = Number(sessionUser.id);
  const dbUser = Number.isInteger(id)
    ? await prisma.user.findUnique({ where: { id } })
    : null;
  if (!dbUser) {
    throw new AuthorizationError("Sessiyangiz eskirgan. Tizimdan chiqib, qaytadan kiring.");
  }
  return dbUser;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new AuthorizationError();
  return session.user;
}

export async function requireCatManagerOrAdmin() {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || (role !== "SYSTEM_ADMIN" && role !== "CAT_MANAGER" && role !== "HEAD_CAT_MANAGER")) {
    throw new AuthorizationError();
  }
  return session.user;
}
