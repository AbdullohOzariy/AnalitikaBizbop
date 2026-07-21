/**
 * "Filiallar narx farqi" PDF buffer'ini quradi (BizBop logo, DejaVu unicode shrift).
 * Manba: analyze/price-quality → BranchPriceDiff[] (allaqachon farq % kamayishi bo'yicha).
 *
 * Hisobotning ASOSIY qiymati — har SKU ostidagi filiallar qatori: qaysi filialda narx
 * boshqacha ekani. Eng arzon yashil, eng qimmat qizil bo'yaladi, qolgani xira —
 * shunda o'qigan odam jadvalni sonma-son solishtirmasdan aybdor filialni ko'radi.
 */
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { formatDateUZ } from "@/lib/format";
import type { BranchPriceDiff } from "@/lib/analyze/price-quality";

const FONT = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));
const pct = (n: number) => `${n.toFixed(1)}%`;

const EMERALD = "#15A34A";
const RED = "#B91C1C"; // eng qimmat filial
const GREEN = "#15803D"; // eng arzon filial

type Col = { x: number; w: number; label: string; align: "left" | "right"; key: string };

export type NarxPdfOptions = {
  periodEnd: string; // ISO sana (YYYY-MM-DD) — tahlil qilingan davr
  minSpreadPct: number; // qanday chegara bilan filtrlangani (sarlavhada ko'rsatiladi)
  truncated?: boolean; // manba ro'yxati LIMIT'ga yetganmi (to'liq emas)
};

export async function buildNarxPdf(rows: BranchPriceDiff[], opts: NarxPdfOptions): Promise<Buffer> {
  // bufferPages — sahifa raqamini "X / Y" qilib yozish uchun: jami sahifa soni faqat
  // hammasi chizilgandan keyin ma'lum bo'ladi, shuning uchun oxirida qaytib yozamiz.
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 40, font: FONT, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; // A4 portret = 595
  const H = doc.page.height; // 842
  const M = 40;
  const usable = W - 2 * M;
  const BOTTOM = H - 60; // pastda sahifa raqami uchun joy qoldiramiz

  // ── Shapka ──
  try {
    if (fs.existsSync(LOGO)) doc.image(LOGO, M, 38, { height: 30 });
  } catch { /* logo bo'lmasa ham davom */ }
  doc.font(FONT_BOLD).fontSize(16).fillColor("#111")
    .text("FILIALLAR NARX FARQI", M, 42, { width: usable, align: "right" });
  doc.font(FONT).fontSize(9).fillColor("#555")
    .text(
      `Davr: ${formatDateUZ(opts.periodEnd)} · ${NF.format(rows.length)} ta SKU · farq ≥ ${pct(opts.minSpreadPct)}`,
      M, 64, { width: usable, align: "right" }
    );

  doc.moveTo(M, 84).lineTo(W - M, 84).lineWidth(1.2).strokeColor(EMERALD).stroke();

  let y = 96;
  doc.font(FONT).fontSize(8).fillColor("#777").text(
    "Bir xil SKU turli filialda turli narxda sotilmoqda. Har qator ostida: filial → narx " +
    "(yashil — eng arzon, qizil — eng qimmat).",
    M, y, { width: usable }
  );
  y = doc.y + 8;

  if (opts.truncated) {
    doc.font(FONT_BOLD).fontSize(8).fillColor(RED).text(
      "⚠ Ro'yxat manbada cheklangan — quyida eng katta farqlar ko'rsatilgan, to'liq emas.",
      M, y, { width: usable }
    );
    y = doc.y + 6;
  }

  // ── Ustunlar (jami 515 = usable) ──
  const cols: Col[] = [];
  let cx = M;
  const push = (w: number, label: string, align: "left" | "right", key: string) => {
    cols.push({ x: cx, w, label, align, key });
    cx += w;
  };
  push(20, "№", "left", "n");
  push(40, "Kod", "left", "code");
  push(150, "Mahsulot", "left", "name");
  push(85, "Kategoriya", "left", "cat");
  push(58, "Min narx", "right", "min");
  push(58, "Max narx", "right", "max");
  push(58, "Farq", "right", "spread");
  push(W - M - cx, "Farq %", "right", "pct");

  const nameCol = cols.find((c) => c.key === "name")!;
  const catCol = cols.find((c) => c.key === "cat")!;
  const HEAD_H = 18;
  const BODY_F = 7.5;
  const BR_F = 6.5; // filiallar qatori — jadvaldan kichikroq, "izoh" sifatida o'qilsin
  const BR_X = M + 20; // № ustuni ostidan boshlab chapga surilgan

  const drawHead = () => {
    doc.rect(M, y, usable, HEAD_H).fillColor(EMERALD).fill();
    doc.font(FONT_BOLD).fontSize(7.5).fillColor("#fff");
    for (const c of cols)
      doc.text(c.label, c.x + 3, y + 5.5, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
    y += HEAD_H;
  };
  drawHead();

  const cellVal = (r: BranchPriceDiff, n: number, key: string): string => {
    switch (key) {
      case "n": return String(n);
      case "code": return String(r.code);
      case "name": return r.name;
      case "cat": return r.categoryName ?? "—";
      case "min": return money(r.minPrice);
      case "max": return money(r.maxPrice);
      case "spread": return money(r.spread);
      case "pct": return pct(r.spreadPct);
      default: return "";
    }
  };

  /** Filiallar qatori segmentlari: "Filial 12 000 · Filial 15 000" (rangli). */
  const branchSegments = (r: BranchPriceDiff): { text: string; color: string }[] => {
    const segs: { text: string; color: string }[] = [];
    r.branches.forEach((b, i) => {
      if (i > 0) segs.push({ text: "  ·  ", color: "#aaa" });
      const color = b.price >= r.maxPrice ? RED : b.price <= r.minPrice ? GREEN : "#555";
      segs.push({ text: `${b.branchName} ${money(b.price)}`, color });
    });
    return segs;
  };

  rows.forEach((r, i) => {
    const segs = branchSegments(r);
    const brText = segs.map((s) => s.text).join("");
    const brW = W - M - BR_X;

    // Balandlik: jadval katagi (nom/kategoriya o'ralishi) + filiallar qatori
    doc.font(FONT).fontSize(BODY_F);
    const nameH = doc.heightOfString(r.name, { width: nameCol.w - 6 });
    const catH = doc.heightOfString(r.categoryName ?? "—", { width: catCol.w - 6 });
    doc.fontSize(BR_F);
    const brH = doc.heightOfString(brText, { width: brW });
    const topH = Math.max(15, Math.max(nameH, catH) + 6);
    const rowH = topH + brH + 5;

    if (y + rowH > BOTTOM) {
      doc.addPage();
      y = M;
      drawHead();
    }
    if (i % 2 === 1) doc.rect(M, y, usable, rowH).fillColor("#F3F7F4").fill();

    for (const c of cols) {
      const wrap = c.key === "name" || c.key === "cat"; // uzun nom o'raladi, qolgani kesiladi
      const bold = c.key === "pct";
      doc.font(bold ? FONT_BOLD : FONT).fontSize(BODY_F).fillColor(bold ? "#B91C1C" : "#222")
        .text(cellVal(r, i + 1, c.key), c.x + 3, y + 4, {
          width: c.w - 6, align: c.align, lineBreak: wrap, ellipsis: !wrap,
        });
    }

    // Filiallar qatori — bitta oqim, segmentlar `continued` bilan ranglanadi.
    // DIQQAT: davomiy segmentda x/y ni `undefined` qilib uzatib bo'lmaydi — pdfkit'ning
    // _initOptions(x = {}, ...) defaulti undefined'ni options deb qabul qilib, sozlamalarni
    // (width/continued) yeb yuboradi. Shuning uchun birinchi segment 4-argumentli,
    // qolganlari 2-argumentli shaklda chaqiriladi.
    doc.font(FONT).fontSize(BR_F);
    segs.forEach((s, k) => {
      const o = { width: brW, continued: k < segs.length - 1, lineBreak: true };
      doc.fillColor(s.color);
      if (k === 0) doc.text(s.text, BR_X, y + topH, o);
      else doc.text(s.text, o);
    });

    y += rowH;
  });

  // ── Sahifa raqamlari (hammasi chizilgandan keyin) ──
  // margins.bottom = 0: aks holda pastki chekkaga yozish pdfkit'da yangi sahifa ochib yuboradi.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font(FONT).fontSize(7).fillColor("#999").text(
      `Filiallar narx farqi · ${formatDateUZ(opts.periodEnd)}          ${i - range.start + 1} / ${range.count}`,
      M, H - 32, { width: usable, align: "center", lineBreak: false }
    );
  }

  doc.end();
  return done;
}
