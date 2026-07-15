/**
 * "Hafta chegirmasi" katalog banneri — butun aksiya bitta PNG'da (A3 portret 150dpi).
 *   GET /api/promo/{id}/catalog
 * Faqat HAFTA_CHEGIRMA turidagi aksiya uchun. Rasmi yuklangan dizaynlar olinadi
 * (placeholder kartochka katalogda yomon ko'rinadi). Node runtime (fs — shrift/logo).
 */
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getCampaignDesigns } from "@/lib/promo-design/data";
import { CatalogBanner } from "@/lib/promo-design/catalog";
import { loadDesignFonts } from "@/lib/promo-design/fonts";
import { PROMO_TYPE_META } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO = path.join(process.cwd(), "public/logo.png");
const WIDTH = 1754; // A3 portret 150dpi
const HEIGHT = 2480;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  if (!canSeePromo(session.user.roles)) return new NextResponse("Ruxsat yo'q", { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri id", { status: 400 });

  const campaign = await prisma.promoCampaign.findUnique({ where: { id }, select: { type: true } });
  if (!campaign) return new NextResponse("Aksiya topilmadi", { status: 404 });
  if (campaign.type !== "HAFTA_CHEGIRMA") {
    return new NextResponse("Katalog rasmi faqat Hafta chegirmasi aksiyasida.", { status: 400 });
  }

  const designs = await getCampaignDesigns(id, { onlyWithImage: true });
  if (designs.length === 0) {
    return new NextResponse("Rasm yuklangan dizayn yo'q (avval mahsulot rasmini yuklang).", { status: 404 });
  }

  const [fonts, logoBuf] = await Promise.all([loadDesignFonts(), readFile(LOGO)]);
  const logoData = `data:image/png;base64,${logoBuf.toString("base64")}`;
  // Sarlavhadagi "-N% gacha" — aksiyadagi eng katta chegirma.
  const maxDiscount = designs.reduce((m, d) => Math.max(m, d.discountPct), 0);

  return new ImageResponse(
    <CatalogBanner
      items={designs}
      title={PROMO_TYPE_META.HAFTA_CHEGIRMA.label}
      dateText={designs[0].dateText}
      maxDiscount={maxDiscount}
      logoData={logoData}
    />,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        "Content-Disposition": `attachment; filename="aksiya-${id}-katalog.png"`,
        "Cache-Control": "no-store",
      },
    }
  );
}
