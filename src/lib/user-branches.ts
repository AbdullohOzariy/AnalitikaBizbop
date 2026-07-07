/**
 * Foydalanuvchi ↔ filial qamrovi (UserBranch). Miniapp (BizbopSotuv) dashboard va
 * inventarizatsiya ma'lumotlari shu qamrov bilan cheklanadi.
 *
 * Konvensiya: biriktirilgan filial YO'Q = cheklovsiz (barcha filiallar) — CEO/admin
 * uchun odatiy. Ro'yxat bo'lsa — faqat o'sha filiallar (xodim o'z filialini ko'radi).
 */
import { prisma } from "@/lib/prisma";

/** Foydalanuvchining filial qamrovi: null = barcha filiallar, massiv = faqat shular. */
export async function userBranchIds(userId: number): Promise<number[] | null> {
  const rows = await prisma.userBranch.findMany({
    where: { userId },
    select: { branchId: true },
  });
  if (rows.length === 0) return null;
  return rows.map((r) => r.branchId);
}

/** Telegram ID bo'yicha platforma foydalanuvchisi (miniapp auth). null = bog'lanmagan. */
export async function userByTelegramId(tgUserId: number): Promise<{
  id: number;
  name: string;
  roles: string[];
  branchIds: number[] | null;
} | null> {
  const u = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgUserId) },
    select: {
      id: true,
      name: true,
      role: true,
      extraRoles: true,
      branches: { select: { branchId: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    roles: [...new Set<string>([u.role, ...u.extraRoles])],
    branchIds: u.branches.length > 0 ? u.branches.map((b) => b.branchId) : null,
  };
}
