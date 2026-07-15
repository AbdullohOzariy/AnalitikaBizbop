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
// Blok = butun yashiklar + qoldiq dona. Kasr blokni "4,167 bl" deb yozsak uz-UZ o'nlik
// verguli sababli 4167 blok deb o'qiladi — nakladnoyda bu xato zakazga olib keladi.
// Shuning uchun "4 bl + 1" ko'rinishi: 4 to'liq yashik va 1 dona alohida.
const blokParts = (qty: number, packSize: number | null): { full: number; rem: number } | null => {
  if (!packSize || packSize <= 0 || qty <= 0) return null;
  const full = Math.floor(qty / packSize);
  if (full <= 0) return null; // to'liq blok yo'q — faqat dona ma'noli ("0 bl + 3" shovqin)
  return { full, rem: Math.round((qty - full * packSize) * 1000) / 1000 };
};
const blokLabel = (full: number, rem: number) =>
  rem > 0 ? `${NF.format(full)} bl + ${NF.format(rem)}` : `${NF.format(full)} bl`;

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
    packSize: i.packSize != null && Number(i.packSize) > 0 ? Number(i.packSize) : null,
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
    .text(`Sana: ${sana} · Holat: ${ORDER_STATUS_LABEL[order.status] ?? order.status}${withBranch ? " · Filiallar bo'yicha (katakda: yuqorida blok, pastda dona)" : ""}`, M, 64, {
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
    const nameW = 150;
    const packW = 30, jamiW = 48, narxW = 60, sumW = 78;
    const branchArea = usable - 24 - 44 - nameW - packW - jamiW - narxW - sumW;
    const bw = Math.max(40, Math.floor(branchArea / branchCols.length));
    push(24, "№", "left", "n");
    push(44, "Kod", "left", "code");
    push(nameW, "Mahsulot", "left", "name");
    push(packW, "Pach.", "right", "packsize"); // bir blokdagi dona — blok sonini tekshirish uchun
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
      case "packsize": return r.packSize != null ? NF.format(r.packSize) : "—";
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
  const bodyFont = withBranch ? 7.5 : 8;

  // Filial va Jami kataklari (faqat filial variantida) ikki qatorli: yuqorida blok (qalin),
  // pastda dona (xira). Pachkasi yo'q SKU'da blok hisoblab bo'lmaydi — faqat dona chiqadi.
  const dualCell = (c: Col, yy: number, qty: number, packSize: number | null, bold = false) => {
    if (qty <= 0) {
      doc.font(FONT).fontSize(bodyFont).fillColor("#222")
        .text("—", c.x + 3, yy + 4, { width: c.w - 6, align: c.align, lineBreak: false });
      return;
    }
    const p = blokParts(qty, packSize);
    if (p == null) {
      doc.font(bold ? FONT_BOLD : FONT).fontSize(bodyFont).fillColor("#222")
        .text(NF.format(qty), c.x + 3, yy + 4, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
      return;
    }
    doc.font(FONT_BOLD).fontSize(bodyFont).fillColor("#111")
      .text(blokLabel(p.full, p.rem), c.x + 3, yy + 2, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
    doc.font(FONT).fontSize(bodyFont - 1).fillColor("#666")
      .text(NF.format(qty), c.x + 3, yy + 10.5, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
  };
  const isDual = (key: string) => withBranch && (key === "qty" || key.startsWith("b:"));

  const drawHead = () => {
    doc.rect(M, y, W - 2 * M, 18).fillColor(EMERALD).fill();
    doc.font(FONT_BOLD).fontSize(headFont).fillColor("#fff");
    for (const c of cols) doc.text(c.label, c.x + 3, y + (withBranch ? 6 : 5), { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
    y += 18;
  };
  drawHead();

  doc.font(FONT).fontSize(bodyFont);
  rows.forEach((r, i) => {
    const nameH = doc.heightOfString(r.name, { width: nameCol.w - 6 });
    const rowH = Math.max(withBranch ? 19 : 16, nameH + 7); // ikki qatorli katak balandroq joy so'raydi
    if (y + rowH > doc.page.height - 90) {
      doc.addPage();
      y = M;
      drawHead();
    }
    if (i % 2 === 1) doc.rect(M, y, W - 2 * M, rowH).fillColor("#F3F7F4").fill();
    for (const c of cols) {
      if (isDual(c.key)) {
        const qty = c.key === "qty" ? r.qty : (r.branchQty.get(Number(c.key.slice(2))) ?? 0);
        dualCell(c, y, qty, r.packSize, c.key === "qty");
        continue;
      }
      const wrap = c.key === "name";
      doc.font(FONT).fontSize(bodyFont).fillColor("#222")
        .text(cellVal(r, c.key), c.x + 3, y + 4, { width: c.w - 6, align: c.align, lineBreak: wrap, ellipsis: !wrap });
    }
    y += rowH;
  });

  // ── Jami qatori ──
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor("#bbb").stroke();
  if (withBranch) {
    // Filial bo'yicha jami miqdorlar + umumiy jami (bir qatorda), blok ustida / dona ostida.
    // Jami blok — har SKU blokining yig'indisi (ombor uchun: "shu filialga nechta yashik").
    // Pachkasi kiritilmagan SKU dona'ga qo'shiladi, blokka esa qo'shilmaydi.
    y += 4;
    const totH = 20;
    doc.rect(M, y, W - 2 * M, totH).fillColor("#EAF5EE").fill();
    const bT = new Map<number, { qty: number; full: number; rem: number }>();
    let totQty = 0, totFull = 0, totRem = 0;
    for (const r of rows) {
      totQty += r.qty;
      const p = blokParts(r.qty, r.packSize);
      if (p) { totFull += p.full; totRem += p.rem; }
      for (const [bid, q] of r.branchQty) {
        const cur = bT.get(bid) ?? { qty: 0, full: 0, rem: 0 };
        const bp = blokParts(q, r.packSize);
        bT.set(bid, { qty: cur.qty + q, full: cur.full + (bp?.full ?? 0), rem: cur.rem + (bp?.rem ?? 0) });
      }
    }
    const totalCell = (c: Col, qty: number, full: number, rem: number) => {
      if (qty <= 0) {
        doc.font(FONT_BOLD).fontSize(7.5).fillColor("#111")
          .text("—", c.x + 3, y + 6, { width: c.w - 6, align: c.align, lineBreak: false });
        return;
      }
      if (full <= 0) {
        doc.font(FONT_BOLD).fontSize(7.5).fillColor("#111")
          .text(NF.format(qty), c.x + 3, y + 6, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
        return;
      }
      doc.font(FONT_BOLD).fontSize(7.5).fillColor("#111")
        .text(blokLabel(full, Math.round(rem * 1000) / 1000), c.x + 3, y + 2, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
      doc.font(FONT).fontSize(6.5).fillColor("#555")
        .text(NF.format(qty), c.x + 3, y + 11, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
    };
    for (const c of cols) {
      if (c.key === "qty") totalCell(c, totQty, totFull, totRem);
      else if (c.key.startsWith("b:")) { const t = bT.get(Number(c.key.slice(2))) ?? { qty: 0, full: 0, rem: 0 }; totalCell(c, t.qty, t.full, t.rem); }
      else if (c.key === "name" || c.key === "sum") {
        doc.font(FONT_BOLD).fontSize(7.5).fillColor("#111")
          .text(c.key === "name" ? "JAMI" : money(total), c.x + 3, y + 6, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
      }
    }
    y += totH + 6;
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
