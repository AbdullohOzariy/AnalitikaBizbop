/**
 * Sverka Mini App: tez tanlash lug'atlari — oldin kiritilgan sklad/kontragent
 * qiymatlari (eng so'nggilari oldin) + tanlangan firmaning shartnomalari
 * (dagavor takliflari). Telegram initData bilan himoyalangan.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { sverkaRuxsatBormi } from "@/lib/sverka/ruxsat";
import { rateLimit } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!rateLimit(`sverka-l:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov." }, { status: 429 });
  }
  if (!(await sverkaRuxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. ID raqamingizni adminga yuboring." }, { status: 403 });
  }

  const url = new URL(req.url);
  const supplierId = Number(url.searchParams.get("supplierId")) || 0;

  const [skladlar, kontragentlar, branches, dagavorlar] = await Promise.all([
    prisma.$queryRaw<{ v: string }[]>(Prisma.sql`
      SELECT sklad AS v FROM "SverkaRecord" GROUP BY sklad ORDER BY MAX(id) DESC LIMIT 15
    `),
    prisma.$queryRaw<{ v: string }[]>(Prisma.sql`
      SELECT kontragent AS v FROM "SverkaRecord" GROUP BY kontragent ORDER BY MAX(id) DESC LIMIT 15
    `),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true } }),
    supplierId
      ? prisma.$queryRaw<{ v: string }[]>(Prisma.sql`
          SELECT v FROM (
            SELECT COALESCE(NULLIF(c.number, ''), c.title) AS v, 0 AS pri, c.id AS oid
            FROM "SupplierContract" c WHERE c."supplierId" = ${supplierId}
            UNION ALL
            SELECT sv.dagavor AS v, 1 AS pri, sv.id AS oid
            FROM "SverkaRecord" sv WHERE sv."supplierId" = ${supplierId}
          ) t GROUP BY v, pri ORDER BY pri ASC, MAX(oid) DESC LIMIT 10
        `)
      : Promise.resolve([] as { v: string }[]),
  ]);

  // Sklad takliflari: filial nomlari + oldin kiritilganlar (takrorsiz)
  const skladSet = new Set<string>();
  const sklad: string[] = [];
  for (const v of [...branches.map((b) => b.name), ...skladlar.map((r) => r.v)]) {
    if (!skladSet.has(v)) { skladSet.add(v); sklad.push(v); }
  }

  return NextResponse.json({
    sklad: sklad.slice(0, 15),
    kontragent: kontragentlar.map((r) => r.v),
    dagavor: dagavorlar.map((r) => r.v),
  });
}
