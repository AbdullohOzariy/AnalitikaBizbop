/**
 * Aksiyaning BARCHA dizayn bannerlarini bitta ZIP arxiv qilib yuklab olish.
 *   GET /api/promo/{id}/designs?format=both|a4|instagram&scope=prepared|all
 * Default: ikkala format + faqat rasm yuklangan dizaynlar. Node runtime (fs — shrift).
 * Ko'rish huquqi: canSeePromo (MERCHANDISER ham).
 */
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { getCampaignDesigns } from "@/lib/promo-design/data";
import { DesignBanner } from "@/lib/promo-design/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_REG = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const FORMATS = [
  { key: "a4", width: 1414, height: 1000 },
  { key: "instagram", width: 1080, height: 1350 },
] as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  if (!canSeePromo(session.user.role)) return new NextResponse("Ruxsat yo'q", { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri id", { status: 400 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "prepared";
  const fmtParam = url.searchParams.get("format");
  const formats =
    fmtParam === "a4" ? FORMATS.filter((f) => f.key === "a4")
    : fmtParam === "instagram" ? FORMATS.filter((f) => f.key === "instagram")
    : FORMATS; // default: ikkalasi

  const designs = await getCampaignDesigns(id, { onlyWithImage: scope === "prepared" });
  if (designs.length === 0) {
    return new NextResponse(
      scope === "prepared" ? "Rasm yuklangan dizayn yo'q (avval mahsulot rasmini yuklang)." : "Dizayn topilmadi.",
      { status: 404 }
    );
  }

  const [fontReg, fontBold, logoBuf] = await Promise.all([readFile(FONT_REG), readFile(FONT_BOLD), readFile(LOGO)]);
  const logoData = `data:image/png;base64,${logoBuf.toString("base64")}`;
  const fonts = [
    { name: "DejaVu", data: fontReg, weight: 400 as const, style: "normal" as const },
    { name: "DejaVu", data: fontBold, weight: 700 as const, style: "normal" as const },
  ];

  // Ketma-ket render — CPU/xotirani cheklash uchun (Satori og'ir). Nomlar unikal.
  const zip = new JSZip();
  const used = new Set<string>();
  for (const d of designs) {
    for (const f of formats) {
      const img = new ImageResponse(<DesignBanner data={d} format={f.key} logoData={logoData} />, {
        width: f.width,
        height: f.height,
        fonts,
      });
      const buf = Buffer.from(await img.arrayBuffer());
      let name = `${d.kind}-${d.fileTag}-${f.key}.png`;
      for (let n = 2; used.has(name); n++) name = `${d.kind}-${d.fileTag}-${f.key}-${n}.png`;
      used.add(name);
      zip.file(name, buf);
    }
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="aksiya-${id}-dizaynlar.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
