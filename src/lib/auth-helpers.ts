import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditPromo, canSeePromo, isSystemAdmin, canManageOrders } from "@/lib/roles";

export class AuthorizationError extends Error {
  constructor(message = "Ruxsat yo'q") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// "requireAdmin" = to'liq admin (SYSTEM_ADMIN). Read-only ADMIN bu yerdan o'tmaydi.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isSystemAdmin(session.user.roles)) {
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

/**
 * Zakaz yaratish/yuritish huquqi: menejer, menejerlar boshi, supplychain yoki
 * SYSTEM_ADMIN. Read-only ADMIN bu yerdan o'tmaydi. canManageOrders bilan mos.
 */
export async function requireOrderCreator() {
  const session = await auth();
  if (!session?.user || !canManageOrders(session.user.roles)) {
    throw new AuthorizationError();
  }
  return session.user;
}

/**
 * Promo (Aksiyalar)ni KO'RISH huquqi — sahifa server-componentlarida ishlatiladi.
 * canSeePromo bilan mos: SYSTEM_ADMIN, ADMIN (read-only), CAT_MANAGER, CEO,
 * HEAD_CAT_MANAGER, MERCHANDISER. Read-only ADMIN ham o'tadi (faqat ko'rish).
 */
export async function requirePromoView() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.roles)) {
    throw new AuthorizationError();
  }
  return session.user;
}

/**
 * Promo (Aksiyalar)ni TAHRIRLASH huquqi — Promo server-actionlari uchun.
 * canEditPromo bilan mos: SYSTEM_ADMIN, CAT_MANAGER, CEO, HEAD_CAT_MANAGER,
 * MERCHANDISER. Read-only ADMIN bu yerdan O'TMAYDI.
 * Qaytaradi: sessiyadagi user (createdById uchun `Number(user.id)` ishlatilsin —
 * requireOrderCreator naqshidagi kabi). Yozuv yaratishda eskirgan JWT xavfi bo'lsa
 * (foydalanuvchi o'chirilgan/qayta seed), requireAdminUser kabi baza tekshiruvi qo'shilishi mumkin.
 */
export async function requirePromoEdit() {
  const session = await auth();
  if (!session?.user || !canEditPromo(session.user.roles)) {
    throw new AuthorizationError();
  }
  return session.user;
}
