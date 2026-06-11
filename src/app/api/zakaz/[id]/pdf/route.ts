/**
 * Zakaz nakladnoyi — brendlangan PDF (BizBop logo, DejaVu unicode shrift).
 * Yetkazib beruvchiga yuborish uchun tayyor hujjat; istalgan bosqichda
 * yuklab olish mumkin. Ko'rish huquqi detal sahifa bilan bir xil
 * (barcha rollar; CAT_MANAGER — faqat o'z zakazi).
 */
import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/app/(app)/sotuv/sotib-olish/order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));

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

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true, status: true, note: true, createdAt: true, sentAt: true, createdById: true,
      supplier: { select: { name: true, phone: true, contactName: true } },
      createdBy: { select: { name: true } },
      items: {
        select: {
          quantity: true, price: true, packCount: true, packSize: true,
          product: { select: { code: true, name: true } },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!order) return new NextResponse("Topilmadi", { status: 404 });
  if (role === "CAT_MANAGER" && order.createdById !== userId) {
    return new NextResponse("Ruxsat yo'q", { status: 403 });
  }

  const rows = order.items.map((i, idx) => ({
    n: idx + 1,
    code: String(i.product.code),
    name: i.product.name,
    pack: i.packCount != null && i.packSize != null ? `${i.packCount} × ${i.packSize}` : "",
    qty: Number(i.quantity),
    price: Number(i.price),
    sum: Number(i.quantity) * Number(i.price),
  }));
  const total = rows.reduce((s, r) => s + r.sum, 0);
  const sana = (order.sentAt ?? order.createdAt).toISOString().slice(0, 10);

  // ── PDF yig'ish ──
  const doc = new PDFDocument({ size: "A4", margin: 40, font: FONT });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; // 595
  const M = 40;
  const EMERALD = "#15A34A";

  // Sarlavha: logo + hujjat nomi
  try {
    if (fs.existsSync(LOGO)) doc.image(LOGO, M, 38, { height: 30 });
  } catch { /* logo bo'lmasa ham davom */ }
  doc.font(FONT_BOLD).fontSize(16).fillColor("#111")
    .text(`BUYURTMA (NAKLADNOY) № ${order.id}`, M, 42, { width: W - 2 * M, align: "right" });
  doc.font(FONT).fontSize(9).fillColor("#555")
    .text(`Sana: ${sana} · Holat: ${ORDER_STATUS_LABEL[order.status] ?? order.status}`, M, 64, {
      width: W - 2 * M, align: "right",
    });

  doc.moveTo(M, 84).lineTo(W - M, 84).lineWidth(1.2).strokeColor(EMERALD).stroke();

  // Taraflar
  let y = 96;
  doc.font(FONT_BOLD).fontSize(9).fillColor("#888").text("BUYURTMACHI", M, y);
  doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text("BizBop Supermarketlari", M, y + 13);
  doc.font(FONT).fontSize(9).fillColor("#444").text(`Mas'ul: ${order.createdBy.name}`, M, y + 28);

  const rx = W / 2 + 10;
  doc.font(FONT_BOLD).fontSize(9).fillColor("#888").text("YETKAZIB BERUVCHI", rx, y);
  doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text(order.supplier.name, rx, y + 13, { width: W - M - rx });
  const supInfo = [order.supplier.contactName, order.supplier.phone].filter(Boolean).join(" · ");
  if (supInfo) doc.font(FONT).fontSize(9).fillColor("#444").text(supInfo, rx, y + 28, { width: W - M - rx });

  y = 150;

  // ── Jadval ──
  // Ustunlar: № | Kod | Mahsulot | Blok×Pachka | Miqdor | Narx | Summa
  const cols = [
    { x: M, w: 24, label: "№", align: "left" as const },
    { x: M + 24, w: 44, label: "Kod", align: "left" as const },
    { x: M + 68, w: 205, label: "Mahsulot", align: "left" as const },
    { x: M + 273, w: 58, label: "Blok×Pach.", align: "right" as const },
    { x: M + 331, w: 50, label: "Miqdor", align: "right" as const },
    { x: M + 381, w: 60, label: "Narx", align: "right" as const },
    { x: M + 441, w: W - 2 * M - 441, label: "Summa", align: "right" as const },
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
    const rowH = Math.max(16, nameH + 7);
    if (y + rowH > doc.page.height - 120) {
      doc.addPage();
      y = M;
      drawHead();
      doc.font(FONT).fontSize(8);
    }
    if (i % 2 === 1) doc.rect(M, y, W - 2 * M, rowH).fillColor("#F3F7F4").fill();
    doc.fillColor("#222");
    const vals = [String(r.n), r.code, r.name, r.pack, NF.format(r.qty), money(r.price), money(r.sum)];
    cols.forEach((c, ci) => doc.text(vals[ci], c.x + 3, y + 4, { width: c.w - 6, align: c.align }));
    y += rowH;
  });

  // Jami
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor("#bbb").stroke();
  y += 6;
  doc.font(FONT_BOLD).fontSize(10).fillColor("#111");
  doc.text(`Jami: ${rows.length} ta SKU`, M, y);
  doc.text(`${money(total)} so'm`, M, y, { width: W - 2 * M, align: "right" });
  y += 24;

  // Izoh
  if (order.note) {
    doc.font(FONT).fontSize(9).fillColor("#444").text(`Izoh: ${order.note}`, M, y, { width: W - 2 * M });
    y = doc.y + 14;
  }

  doc.end();
  const buffer = await done;

  const safeName = order.supplier.name.replace(/[^\w\d-]+/g, "_").slice(0, 40);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="zakaz-${order.id}-${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
