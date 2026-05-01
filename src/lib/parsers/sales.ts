import * as XLSX from "xlsx";
import {
  parseAmount,
  parseRussianPeriod,
  normalizeName,
} from "./utils";

export type ParsedSalesBranchRow = {
  /** Excel ichidagi sklad nomi (alias). Saqlashdan oldin DB dagi branch.id ga yechilishi kerak. */
  branchAlias: string;
  /** Kategoriya nomi (Bo'limlar.txt dan birortasiga teng bo'lishi kerak). */
  categoryName: string;
  amount: number;
};

export type ParsedSalesResult = {
  periodStart: Date;
  periodEnd: Date;
  rows: ParsedSalesBranchRow[];
  /** Tanlangan kategoriyalarda yo'q va o'tkazib yuborilgan nomlar (audit uchun). */
  skippedCategories: string[];
};

/**
 * 29.04.xlsx (1 kun, 1 filial) yoki 1(2).xlsx (period, ko'p filial) ni o'qiydi.
 *
 * Format kutilmalari:
 *  - Row 1 (index 1) — sarlavha: "Продажи товаров за период с DD.MM.YYYY по DD.MM.YYYY"
 *  - Row 5 (index 5) — header: ['Код', 'Номенклатура', '<sklad1>', ..., 'Итого']
 *  - Keyin data qatorlari. Код = number (folder), Код = string (item) — biz faqat
 *    nomi 'allowedCategories' ichida bo'lganlarini olamiz.
 */
export function parseSalesWorkbook(
  buffer: Buffer,
  allowedCategoryNames: string[],
  /** AI tomonidan taklif qilingan moslik: normalizedExcelName → normalizedDbName */
  categoryMapping?: Map<string, string>
): ParsedSalesResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("Excel ichida birorta varaq topilmadi.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  // 1) Sarlavhadan period topish (har qaysi qatorda bo'lishi mumkin)
  let period: { start: Date; end: Date } | null = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    for (const cell of rows[i] ?? []) {
      const p = parseRussianPeriod(cell);
      if (p) {
        period = p;
        break;
      }
    }
    if (period) break;
  }
  if (!period) {
    throw new Error(
      "Sotuv faylida period sarlavhasi topilmadi (\"Продажи товаров за период с ... по ...\")."
    );
  }

  // 2) Header qatorini topish: birinchi qatorda 'Код' va 'Номенклатура' bo'lsa
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = r[0];
    const b = r[1];
    if (typeof a === "string" && typeof b === "string") {
      if (a.trim().toLowerCase() === "код" && b.trim().toLowerCase().startsWith("номенклатура")) {
        headerIdx = i;
        break;
      }
    }
  }
  if (headerIdx === -1) {
    throw new Error("Sotuv faylida header qatori (Код | Номенклатура | ...) topilmadi.");
  }

  const headerRow = rows[headerIdx] as (string | null)[];
  // 3) Filial ustunlarini aniqlash: 'Код', 'Номенклатура' dan keyin va 'Итого' dan oldin
  const branchCols: { index: number; alias: string }[] = [];
  for (let c = 2; c < headerRow.length; c++) {
    const v = headerRow[c];
    if (typeof v !== "string") continue;
    const alias = v.trim();
    if (!alias) continue;
    if (alias.toLowerCase() === "итого") continue;
    branchCols.push({ index: c, alias });
  }
  if (branchCols.length === 0) {
    throw new Error("Filial ustunlari topilmadi (header qatorida sklad nomi yo'q).");
  }

  // 4) "Сумма" qator(lar)i — header tagidagi "Продажи"/"Сумма" sub-headerlarni o'tkazib yuboramiz
  let dataStartIdx = headerIdx + 1;
  while (dataStartIdx < rows.length) {
    const r = rows[dataStartIdx];
    const a = r?.[0];
    const looksLikeSubHeader =
      a == null &&
      r?.some(
        (v) =>
          typeof v === "string" &&
          ["продажи", "сумма"].includes(v.trim().toLowerCase())
      );
    if (looksLikeSubHeader) dataStartIdx++;
    else break;
  }

  // 5) Data qatorlarini yig'ish
  const allowed = new Set(allowedCategoryNames.map(normalizeName));
  const out: ParsedSalesBranchRow[] = [];
  const skipped = new Set<string>();

  for (let i = dataStartIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = r[1];
    if (typeof name !== "string") continue;

    const norm = normalizeName(name);
    // AI tomonidan taklif qilingan moslikni tekshir
    const effective = categoryMapping?.get(norm) ?? norm;
    if (!allowed.has(effective)) {
      if (typeof r[0] === "number") skipped.add(norm);
      continue;
    }

    for (const { index, alias } of branchCols) {
      const amt = parseAmount(r[index]);
      if (amt == null || amt === 0) continue;
      out.push({
        branchAlias: alias,
        categoryName: effective,  // DB nomi (AI o'zgartirganda ham to'g'ri)
        amount: amt,
      });
    }
  }

  if (out.length === 0) {
    throw new Error(
      "Faylda hech qaysi kerakli kategoriya topilmadi. Bo'limlar ro'yxatini tekshiring."
    );
  }

  return {
    periodStart: period.start,
    periodEnd: period.end,
    rows: out,
    skippedCategories: [...skipped],
  };
}
