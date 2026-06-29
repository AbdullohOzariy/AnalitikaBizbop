/**
 * Aksiya dizayn bannerini PNG sifatida render qiladi (next/og — Satori).
 *   GET /api/promo/design?kind=item|group&id=X&format=a4|instagram
 * Node runtime (fs — shrift fayllari). Ko'rish huquqi: canSeePromo.
 */
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { getDesignData } from "@/lib/promo-design/data";
import { DesignBanner } from "@/lib/promo-design/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_REG = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  if (!canSeePromo(session.user.roles)) return new NextResponse("Ruxsat yo'q", { status: 403 });

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "group" ? "group" : kindParam === "item" ? "item" : null;
  const id = Number(url.searchParams.get("id"));
  const format = url.searchParams.get("format") === "instagram" ? "instagram" : "a4";
  if (!kind || !Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri parametr", { status: 400 });

  const data = await getDesignData(kind, id);
  if (!data) return new NextResponse("Topilmadi", { status: 404 });

  const [fontReg, fontBold, logoBuf] = await Promise.all([readFile(FONT_REG), readFile(FONT_BOLD), readFile(LOGO)]);
  const logoData = `data:image/png;base64,${logoBuf.toString("base64")}`;
  const { width, height } = format === "a4" ? { width: 1414, height: 1000 } : { width: 1080, height: 1350 };

  return new ImageResponse(<DesignBanner data={data} format={format} logoData={logoData} />, {
    width,
    height,
    fonts: [
      { name: "DejaVu", data: fontReg, weight: 400, style: "normal" },
      { name: "DejaVu", data: fontBold, weight: 700, style: "normal" },
    ],
    headers: {
      "Content-Disposition": `attachment; filename="aksiya-design-${data.fileTag}-${format}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
