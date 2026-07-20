/**
 * Miniapp ta'minotchi (Supplier) katalogi — vozvrat formasidagi "Ta'minotchi nomi"
 * maydoni endi erkin matn emas, shu picker orqali tanlanadi (imlo xatolari/registr
 * farqi bilan bir xil postavshikning ko'p xil yozilishini oldini olish uchun).
 * Auth/scope naqshi src/app/api/sku/route.ts bilan AYNAN bir xil.
 * Rejimlar: ?q= — nom bo'yicha qidiruv | parametrsiz — standart ro'yxat (sortOrder/nom).
 */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import { ruxsatBormi } from "@/lib/spisaniya/db";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 50;

export async function GET(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  // Qidiruv har tugmada chaqiriladi — sku bilan bir xil limit
  if (!rateLimit(`taminotchilar:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov" }, { status: 429 });
  }
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length > 60) {
    return NextResponse.json({ xato: "Qidiruv juda uzun." }, { status: 400 });
  }

  try {
    const rows = await prisma.supplier.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      // Qidiruvsiz — sozlamalar sahifasidagi standart tartib; qidiruvda — alifbo
      orderBy: q ? { name: "asc" } : [{ sortOrder: "asc" }, { name: "asc" }],
      take: LIMIT,
      select: { id: true, name: true },
    });
    return NextResponse.json({
      taminotchilar: rows.map((r) => ({ id: r.id, nomi: r.name })),
    });
  } catch (err) {
    console.error("[api/taminotchilar]", err instanceof Error ? err.message : err);
    return NextResponse.json({ xato: "Server xatosi" }, { status: 500 });
  }
}
