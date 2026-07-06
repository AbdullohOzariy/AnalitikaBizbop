/**
 * Zakaz nakladnoyi PDF buffer'ini quradi (BizBop logo, DejaVu unicode shrift).
 * Avval HTTP route ichida edi (api/zakaz/[id]/pdf) — endi umumiy: HTTP yuklab olish
 * ham, Telegram'ga yuborish ham shu funksiyani ishlatadi (DRY).
 *
 * IKKI variant:
 *   - "total"      — faqat jami miqdor (klassik, portret). Default.
 *   - "withBranch" — har filial alohida ustun + jami (landshaft). Filial taqsimoti
 *                    bo'lmagan (eski) zakazda avtomatik "total" ga tushadi.
 */
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/zakaz/order-status";

const FONT = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));

export type ZakazPdfVariant = "total" | "withBranch";

export type ZakazPdfResult = {
  buffer: Buffer;
  filename: string;
  orderId: number;
  createdById: number; // ruxsat tekshiruvi uchun (CAT_MANAGER — faqat o'z zakazi)
  supplierName: string;
  agentName: string | null;
  status: string;
  skuCount: number;
  total: number;
  sana: string;
  withBranch: boolean; // natijada filial ustunlari chiqdimi
};

type Col = { x: number; w: number; label: string; align: "left" | "right"; key: string };

export async function buildZakazPdf(orderId: number, variant: ZakazPdfVariant = "total"): Promise<ZakazPdfResult | null> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, note: true, createdAt: true, sentAt: true, createdById: true,
      supplier: { select: { name: true, phone: true, contactName: true } },
      agent: { select: { name: true, phone: true, contactName: true } },
      createdBy: { select: { name: true } },
      items: {
        select: {
          quantity: true, price: true, packCount: true, packSize: true,
          product: { select: { code: true, name: true } },
          branchQtys: { select: { quantity: true, branch: { select: { id: true, name: true, sortOrder: true } } } },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!order) return null;

  const itemRows = order.items.filter((i) => Number(i.quantity) > 0); // 0 (zakaz berilmagan) SKU kirmaydi

  // Filial ustunlari — zakazda qty>0 uchragan filiallar (sortOrder bo'yicha)
  const branchMap = new Map<number, { id: number; name: string; sort: number }>();
  for (const it of itemRows)
    for (const bq of it.branchQtys)
      if (Number(bq.quantity) > 0) branchMap.set(bq.branch.id, { id: bq.branch.id, name: bq.branch.name, sort: bq.branch.sortOrder });
  const branchCols = [...branchMap.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "uz"));
  // Landshaftda ustun kengligi cheklangan — 10 dan ortiq filialda Summa ustuni o'qilmas
  // bo'lib qoladi, shuning uchun bunda avtomatik faqat-jami ko'rinishga tushamiz.
  const withBranch = variant === "withBranch" && branchCols.length > 0 && branchCols.length <= 10;

  const rows = itemRows.map((i, idx) => ({
    n: idx + 1,
    code: String(i.product.code),
    name: i.product.name,
    pack: i.packCount != null && i.packSize != null ? `${Number(i.packCount)} × ${Number(i.packSize)}` : "",
    qty: Number(i.quantity),
    price: Number(i.price),
    sum: Number(i.quantity) * Number(i.price),
    branchQty: new Map(i.branchQtys.map((bq) => [bq.branch.id, Number(bq.quantity)])),
  }));
  const total = rows.reduce((s, r) => s + r.sum, 0);
  const sana = (order.sentAt ?? order.createdAt).toISOString().slice(0, 10);

  // ── PDF yig'ish ──
  const doc = new PDFDocument({ size: "A4", layout: withBranch ? "landscape" : "portrait", margin: 40, font: FONT });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; // portret 595, landshaft 842
  const M = 40;
  const EMERALD = "#15A34A";

  try {
    if (fs.existsSync(LOGO)) doc.image(LOGO, M, 38, { height: 30 });
  } catch { /* logo bo'lmasa ham davom */ }
  doc.font(FONT_BOLD).fontSize(16).fillColor("#111")
    .text(`BUYURTMA (NAKLADNOY) № ${order.id}`, M, 42, { width: W - 2 * M, align: "right" });
  doc.font(FONT).fontSize(9).fillColor("#555")
    .text(`Sana: ${sana} · Holat: ${ORDER_STATUS_LABEL[order.status] ?? order.status}${withBranch ? " · Filiallar bo'yicha" : ""}`, M, 64, {
      width: W - 2 * M, align: "right",
    });

  doc.moveTo(M, 84).lineTo(W - M, 84).lineWidth(1.2).strokeColor(EMERALD).stroke();

  let y = 96;
  doc.font(FONT_BOLD).fontSize(9).fillColor("#888").text("BUYURTMACHI", M, y);
  doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text("BizBop Supermarketlari", M, y + 13);
  doc.font(FONT).fontSize(9).fillColor("#444").text(`Mas'ul: ${order.createdBy.name}`, M, y + 28);

  const rx = W / 2 + 10;
  doc.font(FONT_BOLD).fontSize(9).fillColor("#888").text("YETKAZIB BERUVCHI", rx, y);
  if (order.agent) {
    doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text(order.agent.name, rx, y + 13, { width: W - M - rx });
    const agInfo = [order.agent.contactName, order.agent.phone].filter(Boolean).join(" · ");
    if (agInfo) doc.font(FONT).fontSize(9).fillColor("#444").text(agInfo, rx, y + 28, { width: W - M - rx });
    doc.font(FONT).fontSize(8).fillColor("#888").text(`Postavshik: ${order.supplier.name}`, rx, y + (agInfo ? 41 : 28), { width: W - M - rx });
  } else {
    doc.font(FONT_BOLD).fontSize(11).fillColor("#111").text(order.supplier.name, rx, y + 13, { width: W - M - rx });
    const supInfo = [order.supplier.contactName, order.supplier.phone].filter(Boolean).join(" · ");
    if (supInfo) doc.font(FONT).fontSize(9).fillColor("#444").text(supInfo, rx, y + 28, { width: W - M - rx });
  }

  y = 150;

  // ── Ustunlar ──
  const usable = W - 2 * M;
  const cols: Col[] = [];
  let cx = M;
  const push = (w: number, label: string, align: "left" | "right", key: string) => { cols.push({ x: cx, w, label, align, key }); cx += w; };
  if (withBranch) {
    const nameW = 168;
    const jamiW = 48, narxW = 60, sumW = 78;
    const branchArea = usable - 24 - 44 - nameW - jamiW - narxW - sumW;
    const bw = Math.max(36, Math.floor(branchArea / branchCols.length));
    push(24, "№", "left", "n");
    push(44, "Kod", "left", "code");
    push(nameW, "Mahsulot", "left", "name");
    for (const b of branchCols) push(bw, b.name, "right", `b:${b.id}`);
    // Summa eng o'ngga yopishsin — Jami/Narx undan oldin
    push(jamiW, "Jami", "right", "qty");
    push(narxW, "Narx", "right", "price");
    push(W - M - cx, "Summa", "right", "sum");
  } else {
    push(24, "№", "left", "n");
    push(44, "Kod", "left", "code");
    push(205, "Mahsulot", "left", "name");
    push(58, "Blok×Pach.", "right", "pack");
    push(50, "Miqdor", "right", "qty");
    push(60, "Narx", "right", "price");
    push(W - M - cx, "Summa", "right", "sum");
  }

  const cellVal = (r: (typeof rows)[number], key: string): string => {
    switch (key) {
      case "n": return String(r.n);
      case "code": return r.code;
      case "name": return r.name;
      case "pack": return r.pack;
      case "qty": return NF.format(r.qty);
      case "price": return money(r.price);
      case "sum": return money(r.sum);
      default: {
        if (key.startsWith("b:")) { const id = Number(key.slice(2)); const q = r.branchQty.get(id) ?? 0; return q > 0 ? NF.format(q) : "—"; }
        return "";
      }
    }
  };

  const nameCol = cols.find((c) => c.key === "name")!;
  const headFont = withBranch ? 7 : 8;
  const drawHead = () => {
    doc.rect(M, y, W - 2 * M, 18).fillColor(EMERALD).fill();
    doc.font(FONT_BOLD).fontSize(headFont).fillColor("#fff");
    for (const c of cols) doc.text(c.label, c.x + 3, y + (withBranch ? 6 : 5), { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
    y += 18;
  };
  drawHead();

  const bodyFont = withBranch ? 7.5 : 8;
  doc.font(FONT).fontSize(bodyFont);
  rows.forEach((r, i) => {
    const nameH = doc.heightOfString(r.name, { width: nameCol.w - 6 });
    const rowH = Math.max(16, nameH + 7);
    if (y + rowH > doc.page.height - 90) {
      doc.addPage();
      y = M;
      drawHead();
      doc.font(FONT).fontSize(bodyFont);
    }
    if (i % 2 === 1) doc.rect(M, y, W - 2 * M, rowH).fillColor("#F3F7F4").fill();
    doc.fillColor("#222");
    for (const c of cols) {
      const wrap = c.key === "name";
      doc.text(cellVal(r, c.key), c.x + 3, y + 4, { width: c.w - 6, align: c.align, lineBreak: wrap, ellipsis: !wrap });
    }
    y += rowH;
  });

  // ── Jami qatori ──
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor("#bbb").stroke();
  if (withBranch) {
    // Filial bo'yicha jami miqdorlar + umumiy jami (bir qatorda)
    y += 4;
    doc.rect(M, y, W - 2 * M, 16).fillColor("#EAF5EE").fill();
    doc.font(FONT_BOLD).fontSize(7.5).fillColor("#111");
    const branchTotals = new Map<number, number>();
    for (const r of rows) for (const [bid, q] of r.branchQty) branchTotals.set(bid, (branchTotals.get(bid) ?? 0) + q);
    for (const c of cols) {
      let v = "";
      if (c.key === "name") v = "JAMI";
      else if (c.key === "qty") v = NF.format(rows.reduce((s, r) => s + r.qty, 0));
      else if (c.key === "sum") v = money(total);
      else if (c.key.startsWith("b:")) { const q = branchTotals.get(Number(c.key.slice(2))) ?? 0; v = q > 0 ? NF.format(q) : "—"; }
      if (v) doc.text(v, c.x + 3, y + 4, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
    }
    y += 22;
  } else {
    y += 6;
    doc.font(FONT_BOLD).fontSize(10).fillColor("#111");
    doc.text(`Jami: ${rows.length} ta SKU`, M, y);
    doc.text(`${money(total)} so'm`, M, y, { width: W - 2 * M, align: "right" });
    y += 24;
  }

  if (withBranch) {
    doc.font(FONT_BOLD).fontSize(10).fillColor("#111")
      .text(`Jami: ${rows.length} ta SKU · ${money(total)} so'm`, M, y, { width: W - 2 * M, align: "right" });
    y += 20;
  }

  if (order.note) {
    doc.font(FONT).fontSize(9).fillColor("#444").text(`Izoh: ${order.note}`, M, y, { width: W - 2 * M });
    y = doc.y + 14;
  }

  doc.end();
  const buffer = await done;

  const safeName = `${order.supplier.name}${order.agent ? "-" + order.agent.name : ""}`.replace(/[^\w\d-]+/g, "_").slice(0, 50);
  return {
    buffer,
    filename: `zakaz-${order.id}-${safeName}${withBranch ? "-filial" : ""}.pdf`,
    orderId: order.id,
    createdById: order.createdById,
    supplierName: order.supplier.name,
    agentName: order.agent?.name ?? null,
    status: order.status,
    skuCount: rows.length,
    total,
    sana,
    withBranch,
  };
}
