/**
 * Health check — Railway healthcheckPath uchun (auth'siz, PUBLIC_PREFIXES'da).
 * DB tirikligini tekshiradi: jarayon tirik-u DB o'lik "yarim-o'lik" holatni ham ushlaydi.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[api/health]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
