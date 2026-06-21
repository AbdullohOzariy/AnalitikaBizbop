/**
 * Zakaz nakladnoyi — brendlangan PDF (BizBop logo, DejaVu unicode shrift).
 * PDF yig'ish logikasi @/lib/zakaz-pdf/pdf da (Telegram yuborish ham shuni ishlatadi).
 * Ko'rish huquqi detal sahifa bilan bir xil (CAT_MANAGER — faqat o'z zakazi).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildZakazPdf } from "@/lib/zakaz-pdf/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  const role = session.user.role;
  const userId = Number(session.user.id);

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri id", { status: 400 });

  const pdf = await buildZakazPdf(id);
  if (!pdf) return new NextResponse("Topilmadi", { status: 404 });
  if (role === "CAT_MANAGER" && pdf.createdById !== userId) {
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
