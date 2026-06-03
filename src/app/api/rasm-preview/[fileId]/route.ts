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
  if (!session || (role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "CEO")) {
    return new NextResponse("Ruxsat yo'q", { status: 403 });
  }

  const { fileId } = await params;
  const url = await telegramFileUrl(fileId);
  if (!url) return new NextResponse("Rasm topilmadi", { status: 404 });

  // Redirect QILMAYMIZ — aks holda BOT_TOKEN'li Telegram URL brauzerga (Network/log)
  // chiqib ketadi. Buning o'rniga faylni server tomonda proxy qilamiz.
  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) return new NextResponse("Rasm topilmadi", { status: 404 });
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Rasm topilmadi", { status: 404 });
  }
}
