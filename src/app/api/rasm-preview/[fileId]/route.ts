/**
 * Yozuvga biriktirilgan rasmni ko'rsatish (Hisobdan chiqarish sahifalari uchun).
 * Telegram fayl havolasiga redirect qiladi. Faqat ADMIN / CAT_MANAGER ko'ra oladi.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { telegramFileUrl } from "@/lib/spisaniya/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session || (role !== "ADMIN" && role !== "CAT_MANAGER")) {
    return new NextResponse("Ruxsat yo'q", { status: 403 });
  }

  const { fileId } = await params;
  const url = await telegramFileUrl(fileId);
  if (!url) return new NextResponse("Rasm topilmadi", { status: 404 });
  return NextResponse.redirect(url);
}
