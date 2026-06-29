/**
 * Aksiya ro'yxatini yuklab olish — Excel (.xlsx) yoki PDF.
 *   GET /api/promo/{id}/export?format=excel|pdf
 * Ko'rish huquqi: canSeePromo (Promo bo'limini ko'radiganlar; MERCHANDISER ham).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { getCampaignExport, buildPromoExcel, buildPromoPdf } from "@/lib/promo-export/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  if (!canSeePromo(session.user.roles)) return new NextResponse("Ruxsat yo'q", { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri id", { status: 400 });

  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "excel";

  const data = await getCampaignExport(id);
  if (!data) return new NextResponse("Aksiya topilmadi", { status: 404 });

  if (format === "pdf") {
    const buffer = await buildPromoPdf(data);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="aksiya-${data.fileTag}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildPromoExcel(data);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aksiya-${data.fileTag}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
