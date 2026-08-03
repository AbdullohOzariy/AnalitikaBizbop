/**
 * Moliya miniapp ruxsati — Telegram ID orqali.
 *
 * Spisaniya/sverka/logistika o'z OQ RO'YXAT jadvallariga tayanadi, Moliya esa
 * platforma foydalanuvchisiga tayanadi: `User.telegramId` biriktirilgan bo'lishi
 * va rolida `canEnterCash` bo'lishi shart. Sababi — kassa yozuvi rol va hisob
 * qamroviga (`UserCashAccount`) bog'liq, ya'ni alohida oq ro'yxat ortiqcha
 * bo'lardi va ikki joyda yuritilishi kerak bo'lardi.
 */
import { prisma } from "@/lib/prisma";
import { canEnterCash } from "@/lib/roles";

export type MoliyaMiniappUser = {
  id: number;
  name: string;
  roles: string[];
  /** Yozuv kiritish mumkin bo'lgan hisoblar; bo'sh = cheklovsiz. */
  accountIds: number[];
};

/** Telegram ID bo'yicha moliya foydalanuvchisi (rol tekshiruvi bilan). */
export async function moliyaUserByTelegramId(tgUserId: number): Promise<MoliyaMiniappUser | null> {
  const u = await prisma.user.findUnique({
    where: { telegramId: BigInt(tgUserId) },
    select: {
      id: true,
      name: true,
      role: true,
      extraRoles: true,
      cashAccounts: { select: { accountId: true } },
    },
  });
  if (!u) return null;

  const roles = [u.role, ...u.extraRoles];
  if (!canEnterCash(roles)) return null;

  return {
    id: u.id,
    name: u.name,
    roles,
    accountIds: u.cashAccounts.map((c) => c.accountId),
  };
}

/** Kirish ekrani uchun: shu Telegram ID moliyaga kira oladimi. */
export async function moliyaRuxsatBormi(tgUserId: number): Promise<boolean> {
  return (await moliyaUserByTelegramId(tgUserId)) !== null;
}
