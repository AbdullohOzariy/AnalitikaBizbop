/**
 * Platforma faollik signali (Tizim → Kirishlar).
 * `FaollikPing` client komponenti chaqiradi — sessiya oynasini uzaytiradi.
 *
 * Gvardiya SHU YERDA majburiy: proxy (src/proxy.ts) o'z middleware funksiyasini
 * uzatgani uchun `authorized` callback'ning `return isLoggedIn` shoxi ishlamaydi —
 * ya'ni /api/* yo'llari avtomatik himoyalanmagan.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { touchAccess } from "@/lib/access-log/log";
import { rateLimit } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  // Client 2 daqiqada bir marta yuboradi — daqiqasiga 5 ta yetarlidan ortiq.
  // Usiz tizimga kirgan foydalanuvchi shu endpointni bombardimon qilib O'Z
  // faollik ko'rsatkichini (hits) sun'iy shishirib qo'ya olardi.
  if (!rateLimit(`faollik:${session.user.id}`, 5, 60_000)) {
    return new NextResponse(null, { status: 429 });
  }

  touchAccess({
    surface: "WEB",
    userId: Number(session.user.id),
    actorName: session.user.name ?? null,
  });

  // Javob tanasi kerak emas — client natijani o'qimaydi.
  return new NextResponse(null, { status: 204 });
}
