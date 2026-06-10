/**
 * Sverka Mini App: firma (yetkazib beruvchi) qidiruvi.
 * "A" yozilsa — A bilan BOSHLANADIGANLAR oldin; "Agr" — boshlanganlar, keyin
 * ichida qatnashganlar. Telegram initData bilan himoyalangan.
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
  if (!rateLimit(`sverka-q:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov." }, { status: 429 });
  }
  if (!(await sverkaRuxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. ID raqamingizni adminga yuboring." }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (!q) {
    // Bo'sh qidiruv — eng ko'p sverka kiritilganlar (tezkor tanlash)
    const top = await prisma.$queryRaw<{ id: number; name: string }[]>(Prisma.sql`
      SELECT s.id, s.name
      FROM "Supplier" s
      LEFT JOIN "SverkaRecord" sv ON sv."supplierId" = s.id
      GROUP BY s.id, s.name
      ORDER BY COUNT(sv.id) DESC, s.name ASC
      LIMIT 10
    `);
    return NextResponse.json({ firmalar: top });
  }

  const rows = await prisma.$queryRaw<{ id: number; name: string }[]>(Prisma.sql`
    SELECT id, name
    FROM "Supplier"
    WHERE name ILIKE '%' || ${q} || '%'
    ORDER BY (name ILIKE ${q} || '%') DESC, name ASC
    LIMIT 10
  `);
  return NextResponse.json({ firmalar: rows });
}
