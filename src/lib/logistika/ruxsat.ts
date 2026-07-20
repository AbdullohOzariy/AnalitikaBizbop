/**
 * Haydovchi roli — ruxsat tekshiruvi. Ro'yxat asosiy bazada (Driver jadvali),
 * ERP'ning Logistika → Ma'lumotlar → Haydovchilar tabida boshqariladi.
 *
 * Haydovchi ERP'ga KIRMAYDI (User yozuvi yo'q) — u faqat Telegram miniappda
 * ishlaydi va Telegram user ID orqali taniladi. Sverka naqshi bilan bir xil.
 */
import { prisma } from "@/lib/prisma";

/** Faol haydovchimi? Nofaol qilingan haydovchi miniappga kira olmaydi. */
export async function driverRuxsatBormi(tgUserId: number): Promise<boolean> {
  const n = await prisma.driver.count({
    where: { tgUserId: BigInt(tgUserId), isActive: true },
  });
  return n > 0;
}

/** Telegram ID bo'yicha faol haydovchi (miniapp so'rovlarida ishlatiladi). */
export async function driverByTgId(tgUserId: number) {
  return prisma.driver.findFirst({
    where: { tgUserId: BigInt(tgUserId), isActive: true },
    select: { id: true, name: true, phone: true },
  });
}
