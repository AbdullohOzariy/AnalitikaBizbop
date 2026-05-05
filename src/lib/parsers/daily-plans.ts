import * as XLSX from "xlsx";
import { parseAmount, parseDate, normalizeName } from "./utils";

export type ParsedDailyPlanRow = {
  branchAlias: string;   // sheet name
  categoryAlias: string; // header'dagi original kategoriya nomi (normalized)
  date: Date;
  planAmount: number;
};

export type ParsedDailyPlansResult = {
  periodStart: Date;
  periodEnd: Date;
  rows: ParsedDailyPlanRow[];
  /** Header'da topilgan, lekin DB kategoriyalariga mos kelmagan nomlar (audit uchun). */
  skippedCategories: string[];
};

type Layout = {
  dateCol: number;
  /** Har kategoriya uchun: header'dagi nom va qiymat ustun indeksi. */
  categoryCols: { name: string; col: number }[];
  /** Sub-header'da Normal/Actual bor-yo'qligi (data qatori 1 yoki 2 qator pastdan boshlanadi). */
  hasSubHeader: boolean;
  /** Birinchi data qatori indeksi. */
  dataStartIdx: number;
  /** Oxirgi data qatori indeksi (jami qatorigacha). */
  dataEndIdx: number;
};

function findLayoutInBlock(
  rows: unknown[][],
  headerIdx: number,
  startCol: number,
  endCol: number
): Layout | null {
  const header = rows[headerIdx] ?? [];
  let dateCol = -1;
  for (let c = startCol; c < endCol; c++) {
    const v = header[c];
    if (typeof v === "string" && v.trim().toLowerCase() === "sana") {
      dateCol = c;
      break;
    }
  }
  if (dateCol === -1) return null;

  // Sub-header tekshirish (Normal/Actual juftliklari yoki yagona qator)
  const subHeader = rows[headerIdx + 1] ?? [];
  let hasSubHeader = false;
  for (let c = dateCol + 1; c < endCol; c++) {
    const v = subHeader[c];
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "normal" || s === "actual") {
        hasSubHeader = true;
        break;
      }
    }
  }

  // Kategoriya ustunlari: dateCol+1 dan boshlab "Jami"/"jami"/null gacha
  const categoryCols: { name: string; col: number }[] = [];
  if (hasSubHeader) {
    // Sub-header'da Normal va Actual juftligi → Normal ustunini olish
    let currentCat = "";
    for (let c = dateCol + 1; c < endCol; c++) {
      const top = header[c];
      if (typeof top === "string" && top.trim() !== "") {
        const name = top.trim();
        const lower = name.toLowerCase();
        if (lower === "jami" || lower === "итого") break;
        currentCat = name;
      }
      const sub = subHeader[c];
      if (typeof sub === "string" && sub.trim().toLowerCase() === "normal" && currentCat) {
        categoryCols.push({ name: currentCat, col: c });
      }
    }
  } else {
    // Sub-header yo'q yoki "Normal" yagona qator — har category 1 ustun
    for (let c = dateCol + 1; c < endCol; c++) {
      const top = header[c];
      if (typeof top !== "string" || top.trim() === "") continue;
      const name = top.trim();
      const lower = name.toLowerCase();
      if (lower === "jami" || lower === "итого") break;
      categoryCols.push({ name, col: c });
    }
  }

  if (categoryCols.length === 0) return null;

  const dataStartIdx = headerIdx + (hasSubHeader ? 2 : 2);
  // hasSubHeader=false bo'lganda ham, sub-header qatorida "Normal" so'zlari bo'lsa o'tkazib yuboramiz
  let realDataStart = dataStartIdx;
  while (realDataStart < rows.length) {
    const r = rows[realDataStart];
    const v = r?.[dateCol];
    const d = parseDate(v);
    if (d) break;
    realDataStart++;
  }

  // Data oxiri: birinchi non-numeric date qator (jami)
  let dataEndIdx = realDataStart;
  while (dataEndIdx < rows.length) {
    const r = rows[dataEndIdx];
    const v = r?.[dateCol];
    const d = parseDate(v);
    if (!d) break;
    dataEndIdx++;
  }

  if (dataEndIdx <= realDataStart) return null;

  return {
    dateCol,
    categoryCols,
    hasSubHeader,
    dataStartIdx: realDataStart,
    dataEndIdx,
  };
}

/**
 * "aprel 2026 kunlik planlar.xlsx" — har sheet bitta filial.
 * Sheet ichida 1 yoki 2 ta jadval bo'lishi mumkin (yonma-yon).
 * Faqat "Normal" (reja) qiymatlari o'qiladi.
 */
export function parseDailyPlansWorkbook(
  buffer: Buffer,
  allowedCategoryNames: string[],
  /** AI/alias dan kelgan moslik: normalizedExcelName → normalizedDbName */
  categoryMapping?: Map<string, string>
): ParsedDailyPlansResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (wb.SheetNames.length === 0) throw new Error("Excel ichida varaq topilmadi.");

  const allowed = new Set(allowedCategoryNames.map(normalizeName));
  const out: ParsedDailyPlanRow[] = [];
  const skipped = new Set<string>();
  let minDate = Infinity;
  let maxDate = -Infinity;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });
    if (rows.length === 0) continue;

    // Header qatorini topish: birinchi qator "sana" so'zi bilan boshlanadigan
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const r = rows[i];
      if (r?.some((v) => typeof v === "string" && v.trim().toLowerCase() === "sana")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new Error(`"${sheetName}": "sana" sarlavhali qator topilmadi.`);
    }

    // Header'dagi barcha "sana" pozitsiyalari — bir nechta jadval yonma-yon bo'lishi mumkin
    const header = rows[headerIdx];
    const sanaPositions: number[] = [];
    for (let c = 0; c < header.length; c++) {
      const v = header[c];
      if (typeof v === "string" && v.trim().toLowerCase() === "sana") {
        sanaPositions.push(c);
      }
    }

    // Har bir jadval blokini parse qilish
    const blockBounds: { start: number; end: number }[] = [];
    for (let i = 0; i < sanaPositions.length; i++) {
      const start = sanaPositions[i];
      const end = i + 1 < sanaPositions.length ? sanaPositions[i + 1] : header.length;
      blockBounds.push({ start, end });
    }

    // Faqat "Normal" jadvalini tanlash:
    // Agar sub-header'da Normal/Actual bor blok bo'lsa — faqat shu blokni olamiz.
    // Aks holda — birinchi (yagona) blokni olamiz.
    const layouts = blockBounds
      .map((b) => findLayoutInBlock(rows, headerIdx, b.start, b.end))
      .filter((l): l is Layout => l != null);

    if (layouts.length === 0) {
      throw new Error(`"${sheetName}": kategoriya ustunlari topilmadi.`);
    }

    const withSub = layouts.find((l) => l.hasSubHeader);
    const layout = withSub ?? layouts[0];

    for (let i = layout.dataStartIdx; i < layout.dataEndIdx; i++) {
      const r = rows[i];
      const date = parseDate(r?.[layout.dateCol]);
      if (!date) continue;

      const t = date.getTime();
      if (t < minDate) minDate = t;
      if (t > maxDate) maxDate = t;

      for (const { name, col } of layout.categoryCols) {
        const amount = parseAmount(r?.[col]);
        if (amount == null || amount === 0) continue;

        const norm = normalizeName(name);
        const effective = categoryMapping?.get(norm) ?? norm;
        if (!allowed.has(effective)) {
          skipped.add(norm);
          continue;
        }

        out.push({
          branchAlias: sheetName.trim(),
          categoryAlias: effective,
          date,
          planAmount: amount,
        });
      }
    }
  }

  if (out.length === 0) {
    throw new Error("Faylda hech qanday kunlik reja topilmadi.");
  }

  return {
    periodStart: new Date(minDate),
    periodEnd:   new Date(maxDate),
    rows: out,
    skippedCategories: [...skipped],
  };
}
