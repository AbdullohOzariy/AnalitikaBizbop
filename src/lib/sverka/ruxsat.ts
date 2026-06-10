/**
 * Sverka roli — ruxsat tekshiruvi. Ro'yxat ASOSIY bazada (SverkaXodim),
 * ERP'ning Sverka sahifasida SA/SUPPLYCHAIN boshqaradi.
 * Spisaniya ro'yxatiga tegmaydi (u bot bazasida, eski tartibda).
 */
import { prisma } from "@/lib/prisma";

export async function sverkaRuxsatBormi(tgUserId: number): Promise<boolean> {
  const n = await prisma.sverkaXodim.count({ where: { tgUserId: BigInt(tgUserId) } });
  return n > 0;
}
