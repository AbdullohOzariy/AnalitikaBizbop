/**
 * Moliya miniapp uchun ma'lumotnomalar: foydalanuvchi yoza oladigan hisoblar,
 * faol moddalar (transfer moddalari CHIQARILGAN — ular alohida forma talab qiladi)
 * va kontragentlar.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authMoliya } from "../auth";
import { isoDay, nowTashkent } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await authMoliya(req, "malumot", 30);
  if ("fail" in a) return a.fail;
  const { user } = a;

  const [accounts, allAccounts, articles, transferArticles, counterparties, costCenters] = await Promise.all([
    prisma.cashAccount.findMany({
      where: {
        isActive: true,
        ...(user.accountIds.length > 0 ? { id: { in: user.accountIds } } : {}),
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    // Ko'chirishning QABUL QILUVCHI tomoni foydalanuvchi qamrovida bo'lishi shart
    // emas (masalan bank hisobi) — shuning uchun to'liq ro'yxat.
    prisma.cashAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    prisma.cashFlowArticle.findMany({
      where: { isActive: true, isTransfer: false },
      orderBy: [{ group: { section: "asc" } }, { group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        direction: true,
        isNeutral: true,
        group: { select: { name: true, section: true } },
      },
    }),
    prisma.cashFlowArticle.findMany({
      where: { isActive: true, isTransfer: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.counterparty.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    prisma.costCenter.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, kind: true },
    }),
  ]);

  // Yopilgan kunlar — miniappda sana tanlashda darrov ko'rsatiladi (server
  // baribir tekshiradi, bu faqat foydalanuvchini ortiqcha urinishdan saqlaydi).
  const bugun = new Date(isoDay(nowTashkent()) + "T00:00:00.000Z");
  const oyOldin = new Date(bugun.getTime() - 31 * 86400_000);
  const closed = await prisma.cashDayClose.findMany({
    where: { onDate: { gte: oyOldin } },
    select: { accountId: true, onDate: true },
  });

  return NextResponse.json({
    ok: true,
    user: { name: user.name },
    bugun: isoDay(bugun),
    accounts,
    allAccounts,
    transferArticles,
    articles: articles.map((x) => ({
      id: x.id,
      name: x.name,
      direction: x.direction,
      isNeutral: x.isNeutral,
      group: x.group.name,
      section: x.group.section,
    })),
    counterparties,
    costCenters,
    closed: closed.map((c) => ({ accountId: c.accountId, onDate: isoDay(c.onDate) })),
  });
}
