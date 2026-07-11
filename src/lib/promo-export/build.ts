/**
 * Aksiya (PromoCampaign) ro'yxatini Excel (.xlsx) va PDF buferiga aylantiradi.
 * Ustunlar rasmga mos: №, Sana, Kod, Nomlari, Sotilish narxi, Aksiya narxi,
 * Aksiya farqi, %, Aksiya limiti. Sotilish/aksiya narxlari va limit PromoItem'dan,
 * farq/% hisoblanadi. PDF — BizBop logo + DejaVu unicode shrift (zakaz PDF naqshi).
 */
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import type { PromoType, PromoStatus } from "@/generated/prisma/client";
import { formatDateUZ } from "@/lib/format";

const FONT = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));
// Limit — butun bo'lsa butun, kasr bo'lsa 3 xonagacha (kg uchun)
const fmtLimit = (n: number | null) =>
  n == null ? "" : n % 1 === 0 ? String(n) : n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 });

const PROMO_TYPE_LABEL: Record<PromoType, string> = {
  KUN_TAKLIFI: "Kun taklifi",
  HAFTA_CHEGIRMA: "Hafta chegirmasi",
  BIZBOP_NARX: "Bizbop narx",
  AAARZON: "A-a-arzon narx!",
  FLASH: "Flash aksiya",
};
const PROMO_STATUS_LABEL: Record<PromoStatus, string> = {
  DRAFT: "Qoralama",
  ACTIVE: "Faol",
  ENDED: "Tugadi",
  CANCELLED: "Bekor",
};

export type PromoExportItem = {
  n: number;
  code: number;
  name: string;
  groupName: string | null; // aksiya ichidagi SKU guruhi (null = guruhsiz)
  regularPrice: number;
  promoPrice: number;
  diff: number; // regularPrice − promoPrice (N+M da 0 — dona narxi o'zgarmaydi)
  pct: number; // diff / regularPrice × 100. N+M da = freeQty/(buyQty+freeQty)*100 (effektiv)
  // N+M ("N ol, M tekin") — null bo'lmasa "Aksiya narxi" o'rniga "N+M tekin" ko'rsatiladi.
  nPlusM: { buy: number; free: number } | null;
  limit: number | null;
};

export type PromoExportData = {
  id: number;
  title: string;
  typeLabel: string;
  statusLabel: string;
  branchName: string;
  note: string | null;
  periodLabel: string; // "17.06.2026 – 24.06.2026" yoki "17.06.2026 – doimiy"
  fileTag: string; // fayl nomi uchun xavfsiz qism
  items: PromoExportItem[];
};

/** Bitta aksiya + uning SKU'larini export uchun tayyorlaydi. null — topilmadi. */
export async function getCampaignExport(campaignId: number): Promise<PromoExportData | null> {
  const c = await prisma.promoCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true, type: true, title: true, status: true, startDate: true, endDate: true, note: true,
      branch: { select: { name: true } },
      itemGroups: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          groupId: true, regularPrice: true, promoPrice: true, promoLimit: true, buyQty: true, freeQty: true,
          product: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (!c) return null;

  // Tartib: guruhlar (sortOrder bo'yicha) ichidagi SKU'lar, oxirida guruhsizlar.
  const groupName = new Map(c.itemGroups.map((g) => [g.id, g.name]));
  const ordered = [...c.items].sort((a, b) => {
    const ga = c.itemGroups.findIndex((g) => g.id === a.groupId);
    const gb = c.itemGroups.findIndex((g) => g.id === b.groupId);
    // guruhsizlar (−1) oxirida
    const ra = ga === -1 ? c.itemGroups.length : ga;
    const rb = gb === -1 ? c.itemGroups.length : gb;
    return ra - rb;
  });

  const items: PromoExportItem[] = ordered.map((it, i) => {
    const reg = Number(it.regularPrice);
    const promo = Number(it.promoPrice);
    const diff = reg - promo;
    const isNM = it.buyQty != null && it.freeQty != null;
    return {
      n: i + 1,
      code: it.product.code,
      name: it.product.name,
      groupName: it.groupId != null ? (groupName.get(it.groupId) ?? null) : null,
      regularPrice: reg,
      promoPrice: promo,
      diff,
      // N+M da narx tushmaydi (promo=reg) — % o'rniga effektiv chegirma.
      pct: isNM ? (it.freeQty! / (it.buyQty! + it.freeQty!)) * 100 : reg > 0 ? (diff / reg) * 100 : 0,
      nPlusM: isNM ? { buy: it.buyQty!, free: it.freeQty! } : null,
      limit: it.promoLimit != null ? Number(it.promoLimit) : null,
    };
  });

  const periodLabel = `${formatDateUZ(c.startDate)} – ${c.endDate ? formatDateUZ(c.endDate) : "doimiy"}`;
  const fileTag = `${c.id}-${c.title}`.replace(/[^\w\d-]+/g, "_").slice(0, 50);

  return {
    id: c.id,
    title: c.title,
    typeLabel: PROMO_TYPE_LABEL[c.type] ?? c.type,
    statusLabel: PROMO_STATUS_LABEL[c.status] ?? c.status,
    branchName: c.branch?.name ?? "Barcha filiallar",
    note: c.note,
    periodLabel,
    fileTag,
    items,
  };
}

// ─── Excel (.xlsx) ───────────────────────────────────────────────────────────
export function buildPromoExcel(d: PromoExportData): Buffer {
  const header = ["№", "Sana", "Kod", "Nomlari", "Sotilish narxi", "Aksiya narxi", "Aksiya farqi", "%", "Aksiya limiti"];
  const lastCol = header.length - 1;
  const hasGroups = d.items.some((it) => it.groupName != null);

  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  aoa.push([d.title]);
  aoa.push([`${d.typeLabel} · ${d.branchName} · ${d.statusLabel}`]);
  aoa.push([]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });
  aoa.push(header);

  // Guruhlangan: guruh o'zgarganda butun kenglikda sarlavha qatori.
  let lastGroup: string | null | undefined = undefined;
  for (const it of d.items) {
    if (hasGroups && it.groupName !== lastGroup) {
      lastGroup = it.groupName;
      const rowIdx = aoa.length;
      aoa.push([it.groupName ?? "Guruhsiz"]);
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: lastCol } });
    }
    aoa.push([
      it.n,
      d.periodLabel,
      it.code,
      it.name,
      it.regularPrice,
      it.nPlusM ? `${it.nPlusM.buy}+${it.nPlusM.free} tekin` : it.promoPrice,
      it.nPlusM ? "" : it.diff,
      Number(it.pct.toFixed(2)),
      it.limit ?? "",
    ]);
  }
  aoa.push([]);
  aoa.push(["", "", "", `Jami: ${d.items.length} ta SKU`]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 4 }, { wch: 22 }, { wch: 9 }, { wch: 42 },
    { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 8 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Aksiya");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────
export async function buildPromoPdf(d: PromoExportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, font: FONT });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const M = 40;
  const EMERALD = "#15A34A";
  const inner = W - 2 * M;

  // Sarlavha
  try { if (fs.existsSync(LOGO)) doc.image(LOGO, M, 38, { height: 30 }); } catch { /* logo bo'lmasa ham */ }
  doc.font(FONT_BOLD).fontSize(15).fillColor("#111").text("AKSIYA RO'YXATI", M, 44, { width: inner, align: "right" });
  doc.font(FONT).fontSize(9).fillColor("#555")
    .text(`${d.typeLabel} · ${d.statusLabel}`, M, 64, { width: inner, align: "right" });

  doc.moveTo(M, 84).lineTo(W - M, 84).lineWidth(1.2).strokeColor(EMERALD).stroke();

  // Aksiya ma'lumoti
  let y = 94;
  doc.font(FONT_BOLD).fontSize(13).fillColor("#111").text(d.title, M, y, { width: inner });
  y = doc.y + 4;
  doc.font(FONT).fontSize(9).fillColor("#444")
    .text(`Davr: ${d.periodLabel}      Filial: ${d.branchName}`, M, y, { width: inner });
  y = doc.y + 10;

  // Jadval ustunlari: № | Kod | Nomi | Sotilish | Aksiya | Farq | % | Limit
  const wN = 24, wCode = 46, wSot = 62, wAks = 62, wFarq = 56, wPct = 40, wLim = 46;
  const wName = inner - (wN + wCode + wSot + wAks + wFarq + wPct + wLim);
  const cols = [
    { x: M, w: wN, label: "№", align: "left" as const },
    { x: M + wN, w: wCode, label: "Kod", align: "left" as const },
    { x: M + wN + wCode, w: wName, label: "Nomlari", align: "left" as const },
    { x: M + wN + wCode + wName, w: wSot, label: "Sotilish", align: "right" as const },
    { x: M + wN + wCode + wName + wSot, w: wAks, label: "Aksiya", align: "right" as const },
    { x: M + wN + wCode + wName + wSot + wAks, w: wFarq, label: "Farq", align: "right" as const },
    { x: M + wN + wCode + wName + wSot + wAks + wFarq, w: wPct, label: "%", align: "right" as const },
    { x: M + wN + wCode + wName + wSot + wAks + wFarq + wPct, w: wLim, label: "Limit", align: "right" as const },
  ];

  const drawHead = () => {
    doc.rect(M, y, inner, 18).fillColor(EMERALD).fill();
    doc.font(FONT_BOLD).fontSize(8).fillColor("#fff");
    for (const c of cols) doc.text(c.label, c.x + 3, y + 5, { width: c.w - 6, align: c.align });
    y += 18;
  };
  drawHead();

  const hasGroups = d.items.some((it) => it.groupName != null);
  let lastGroup: string | null | undefined = undefined;
  let zebra = 0;
  doc.font(FONT).fontSize(8);
  d.items.forEach((r) => {
    // Guruh sarlavhasi (guruh o'zgarganda) — butun kenglikda, yashil fon.
    if (hasGroups && r.groupName !== lastGroup) {
      lastGroup = r.groupName;
      if (y + 15 > doc.page.height - 70) { doc.addPage(); y = M; drawHead(); }
      doc.rect(M, y, inner, 15).fillColor("#E7F3EC").fill();
      doc.font(FONT_BOLD).fontSize(8).fillColor("#15803D").text(r.groupName ?? "Guruhsiz", M + 4, y + 4, { width: inner - 8 });
      y += 15;
      doc.font(FONT).fontSize(8);
      zebra = 0;
    }
    const nameH = doc.heightOfString(r.name, { width: cols[2].w - 6 });
    const rowH = Math.max(16, nameH + 7);
    if (y + rowH > doc.page.height - 70) { doc.addPage(); y = M; drawHead(); doc.font(FONT).fontSize(8); }
    if (zebra % 2 === 1) doc.rect(M, y, inner, rowH).fillColor("#F3F7F4").fill();
    zebra++;
    doc.fillColor("#222");
    doc.text(String(r.n), cols[0].x + 3, y + 4, { width: cols[0].w - 6, align: "left" });
    doc.text(String(r.code), cols[1].x + 3, y + 4, { width: cols[1].w - 6, align: "left" });
    doc.text(r.name, cols[2].x + 3, y + 4, { width: cols[2].w - 6, align: "left" });
    doc.text(money(r.regularPrice), cols[3].x + 3, y + 4, { width: cols[3].w - 6, align: "right" });
    doc.font(FONT_BOLD).fillColor("#15803D").text(r.nPlusM ? `${r.nPlusM.buy}+${r.nPlusM.free} tekin` : money(r.promoPrice), cols[4].x + 3, y + 4, { width: cols[4].w - 6, align: "right" });
    doc.font(FONT).fillColor("#222").text(r.nPlusM ? "—" : money(r.diff), cols[5].x + 3, y + 4, { width: cols[5].w - 6, align: "right" });
    doc.text(`${r.pct.toFixed(1)}%`, cols[6].x + 3, y + 4, { width: cols[6].w - 6, align: "right" });
    doc.text(fmtLimit(r.limit), cols[7].x + 3, y + 4, { width: cols[7].w - 6, align: "right" });
    y += rowH;
  });

  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor("#bbb").stroke();
  y += 6;
  doc.font(FONT_BOLD).fontSize(10).fillColor("#111").text(`Jami: ${d.items.length} ta SKU`, M, y);
  y += 20;
  if (d.note) doc.font(FONT).fontSize(9).fillColor("#444").text(`Izoh: ${d.note}`, M, y, { width: inner });

  doc.end();
  return done;
}
