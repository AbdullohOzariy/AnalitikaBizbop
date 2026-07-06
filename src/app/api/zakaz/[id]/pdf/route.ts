/**
 * Zakaz nakladnoyi — brendlangan PDF (BizBop logo, DejaVu unicode shrift).
 * PDF yig'ish logikasi @/lib/zakaz-pdf/pdf da (Telegram yuborish ham shuni ishlatadi).
 * Ko'rish huquqi detal sahifa bilan bir xil (CAT_MANAGER — faqat o'z zakazi).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildZakazPdf } from "@/lib/zakaz-pdf/pdf";
import { ordersScopedToOwn } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  const roles = session.user.roles;
  const userId = Number(session.user.id);

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri id", { status: 400 });

  const variant = new URL(req.url).searchParams.get("variant") === "withBranch" ? "withBranch" : "total";
  const pdf = await buildZakazPdf(id, variant);
  if (!pdf) return new NextResponse("Topilmadi", { status: 404 });
  if (ordersScopedToOwn(roles) && pdf.createdById !== userId) {
    return new NextResponse("Ruxsat yo'q", { status: 403 });
  }

  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Kutilmagan xatoda yalang'och 500 o'rniga log + tushunarli javob (L18).
export async function GET(...args: Parameters<typeof handleGET>) {
  try {
    return await handleGET(...args);
  } catch (err) {
    console.error("[api/zakaz/pdf]", err instanceof Error ? err.message : err);
    return new Response("Eksport tayyorlashda xato. Birozdan so'ng qayta urinib ko'ring.", { status: 500 });
  }
}
