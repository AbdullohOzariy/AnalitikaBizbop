/**
 * Admin-only kesh tozalash. Ma'lumot ilovadan TASHQARI o'zgartirilganda
 * (masalan to'g'ridan-to'g'ri seed/migration) unstable_cache teglarini yangilash uchun.
 *
 * Foydalanish (admin sifatida login bo'lib): POST/GET /api/revalidate?tag=iyerarxiya
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";

const ALLOWED = new Set(["iyerarxiya", "analytics", "branches"]);

async function handle(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return NextResponse.json({ ok: false, error: "Ruxsat yo'q" }, { status: 403 });

  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  if (!ALLOWED.has(tag))
    return NextResponse.json(
      { ok: false, error: `Noma'lum tag. Ruxsat: ${[...ALLOWED].join(", ")}` },
      { status: 400 }
    );

  revalidateTag(tag, "max");
  return NextResponse.json({ ok: true, tag, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
