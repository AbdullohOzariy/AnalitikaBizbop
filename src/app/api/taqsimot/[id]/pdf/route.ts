/**
 * Taqsimot pikking ro'yxati — brendlangan PDF (BizBop logo, DejaVu unicode shrift).
 * Omborchi uchun: qaysi SKU, qancha, qaysi filialga. "Olindi" ustuni qo'lda belgilash uchun.
 * Ko'rish huquqi: canManageWarehouse (SUPPLYCHAIN / SYSTEM_ADMIN).
 */
import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageWarehouse } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const NF = new Intl.NumberFormat("uz-UZ");
const STATUS_LABEL: Record<string, string> = { DRAFT: "Qoralama", CONFIRMED: "Tasdiqlandi", CANCELLED: "Bekor" };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Ruxsat yo'q", { status: 401 });
  if (!canManageWarehouse(session.user.roles)) return new NextResponse("Ruxsat yo'q", { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Noto'g'ri id", { status: 400 });

  const d = await prisma.distribution.findUnique({
    where: { id },
    select: {
      id: true, status: true, note: true, createdAt: true, confirmedAt: true, targetDays: true,
      branch: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: { select: { qty: true, product: { select: { code: true, name: true } } }, orderBy: { product: { name: "asc" } } },
    },
  });
  if (!d) return new NextResponse("Topilmadi", { status: 404 });

  const rows = d.items.map((i, idx) => ({ n: idx + 1, code: String(i.product.code), name: i.product.name, qty: Number(i.qty) }));
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const sana = (d.confirmedAt ?? d.createdAt).toISOString().slice(0, 10);

  const doc = new PDFDocument({ size: "A4", margin: 40, font: FONT });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const M = 40;
  const EMERALD = "#15A34A";

  try { if (fs.existsSync(LOGO)) doc.image(LOGO, M, 38, { height: 30 }); } catch { /* logo bo'lmasa ham */ }
  doc.font(FONT_BOLD).fontSize(16).fillColor("#111").text(`TAQSIMOT (PIKKING) № ${d.id}`, M, 42, { width: W - 2 * M, align: "right" });
  doc.font(FONT).fontSize(9).fillColor("#555").text(`Sana: ${sana} · Holat: ${STATUS_LABEL[d.status] ?? d.status} · Qoplash: ${d.targetDays} kun`, M, 64, { width: W - 2 * M, align: "right" });

  doc.moveTo(M, 84).lineTo(W - M, 84).lineWidth(1.2).strokeColor(EMERALD).stroke();

  let y = 96;
  doc.font(FONT_BOLD).fontSize(9).fillColor("#888").text("OMBOR", M, y);
  doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text("Markaziy ombor", M, y + 13);
  doc.font(FONT).fontSize(9).fillColor("#444").text(`Mas'ul: ${d.createdBy.name}`, M, y + 28);

  const rx = W / 2 + 10;
  doc.font(FONT_BOLD).fontSize(9).fillColor("#888").text("QABUL QILUVCHI FILIAL", rx, y);
  doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text(d.branch.name, rx, y + 13, { width: W - M - rx });

  y = 150;

  // Ustunlar: № | Kod | Mahsulot | Miqdor | Olindi (☐)
  const cols = [
    { x: M, w: 26, label: "№", align: "left" as const },
    { x: M + 26, w: 54, label: "Kod", align: "left" as const },
    { x: M + 80, w: W - 2 * M - 80 - 70 - 60, label: "Mahsulot", align: "left" as const },
    { x: W - M - 130, w: 70, label: "Miqdor", align: "right" as const },
    { x: W - M - 60, w: 60, label: "Olindi", align: "center" as const },
  ];

  const drawHead = () => {
    doc.rect(M, y, W - 2 * M, 18).fillColor(EMERALD).fill();
    doc.font(FONT_BOLD).fontSize(8).fillColor("#fff");
    for (const c of cols) doc.text(c.label, c.x + 3, y + 5, { width: c.w - 6, align: c.align });
    y += 18;
  };
  drawHead();

  doc.font(FONT).fontSize(8);
  rows.forEach((r, i) => {
    const nameH = doc.heightOfString(r.name, { width: cols[2].w - 6 });
    const rowH = Math.max(18, nameH + 8);
    if (y + rowH > doc.page.height - 90) { doc.addPage(); y = M; drawHead(); doc.font(FONT).fontSize(8); }
    if (i % 2 === 1) doc.rect(M, y, W - 2 * M, rowH).fillColor("#F3F7F4").fill();
    doc.fillColor("#222");
    doc.text(String(r.n), cols[0].x + 3, y + 5, { width: cols[0].w - 6, align: "left" });
    doc.text(r.code, cols[1].x + 3, y + 5, { width: cols[1].w - 6, align: "left" });
    doc.text(r.name, cols[2].x + 3, y + 5, { width: cols[2].w - 6, align: "left" });
    doc.font(FONT_BOLD).text(NF.format(r.qty), cols[3].x + 3, y + 5, { width: cols[3].w - 6, align: "right" });
    doc.font(FONT);
    // "Olindi" — qo'lda belgilash uchun bo'sh katak
    doc.rect(cols[4].x + cols[4].w / 2 - 6, y + rowH / 2 - 6, 12, 12).lineWidth(0.8).strokeColor("#999").stroke();
    y += rowH;
  });

  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor("#bbb").stroke();
  y += 6;
  doc.font(FONT_BOLD).fontSize(10).fillColor("#111");
  doc.text(`Jami: ${rows.length} ta SKU`, M, y);
  doc.text(`${NF.format(totalQty)} dona`, M, y, { width: W - 2 * M, align: "right" });
  y += 24;

  if (d.note) { doc.font(FONT).fontSize(9).fillColor("#444").text(`Izoh: ${d.note}`, M, y, { width: W - 2 * M }); }

  doc.end();
  const buffer = await done;
  const safeName = d.branch.name.replace(/[^\w\d-]+/g, "_").slice(0, 40);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="taqsimot-${d.id}-${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
