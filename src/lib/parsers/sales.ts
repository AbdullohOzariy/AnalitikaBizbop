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
  /** Yangi format (2026): Себестоимость ustunidan. Eski formatda null. */
  costAmount: number | null;
};

export type ParsedSalesResult = {
  periodStart: Date;
  periodEnd: Date;
  rows: ParsedSalesBranchRow[];
  /** Tanlangan kategoriyalarda yo'q va o'tkazib yuborilgan nomlar (audit uchun). */
  skippedCategories: string[];
};

/**
 * Eski format (29.04.xlsx, 1(2).xlsx): har filial uchun 1 ustun (faqat Продажи).
 * Yangi format (NewSampleSotuv.2026.xlsx): har filial uchun 2 ustun (Продажи + Себестоимость).
 * Format avto-aniqlanadi: header keyingi qatorda "Себестоимость" bor bo'lsa → yangi format.
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

  // 1) Period sarlavhadan topish
  let period: { start: Date; end: Date } | null = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    for (const cell of rows[i] ?? []) {
      const p = parseRussianPeriod(cell);
      if (p) { period = p; break; }
    }
    if (period) break;
  }
  if (!period) {
    throw new Error(
      'Sotuv faylida period sarlavhasi topilmadi ("Продажи товаров за период с ... по ...").'
    );
  }

  // 2) Header qatorini topish: "Код" va "Номенклатура"
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = r[0];
    const b = r[1];
    if (
      typeof a === "string" && typeof b === "string" &&
      a.trim().toLowerCase() === "код" &&
      b.trim().toLowerCase().startsWith("номенклатура")
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("Sotuv faylida header qatori (Код | Номенклатура | ...) topilmadi.");
  }

  const headerRow = rows[headerIdx] as (string | null)[];

  // 3) Format aniqlash: header dan keyingi qatorda "Себестоимость" bormi?
  let isNewFormat = false;
  for (let i = headerIdx + 1; i < Math.min(headerIdx + 4, rows.length); i++) {
    const r = rows[i];
    if (r?.some((v) => typeof v === "string" && v.trim().toLowerCase() === "себестоимость")) {
      isNewFormat = true;
      break;
    }
  }

  // 4) Filial ustunlarini aniqlash
  type BranchCol = { salesIndex: number; costIndex: number | null; alias: string };
  const branchCols: BranchCol[] = [];

  if (isNewFormat) {
    // Yangi format: filial nomi juft ustunlarda (col, col+1) = (Продажи, Себестоимость)
    for (let c = 2; c < headerRow.length; c += 2) {
      const v = headerRow[c];
      if (typeof v !== "string") continue;
      const alias = v.trim();
      if (!alias || alias.toLowerCase() === "итого") continue;
      branchCols.push({ salesIndex: c, costIndex: c + 1, alias });
    }
  } else {
    // Eski format: har filial uchun 1 ustun
    for (let c = 2; c < headerRow.length; c++) {
      const v = headerRow[c];
      if (typeof v !== "string") continue;
      const alias = v.trim();
      if (!alias || alias.toLowerCase() === "итого") continue;
      branchCols.push({ salesIndex: c, costIndex: null, alias });
    }
  }

  if (branchCols.length === 0) {
    throw new Error("Filial ustunlari topilmadi (header qatorida sklad nomi yo'q).");
  }

  // 5) Sub-headerlarni o'tkazib yuborish ("Продажи", "Себестоимость", "Сумма")
  let dataStartIdx = headerIdx + 1;
  while (dataStartIdx < rows.length) {
    const r = rows[dataStartIdx];
    const a = r?.[0];
    const looksLikeSubHeader =
      a == null &&
      r?.some(
        (v) =>
          typeof v === "string" &&
          ["продажи", "себестоимость", "сумма"].includes(v.trim().toLowerCase())
      );
    if (looksLikeSubHeader) dataStartIdx++;
    else break;
  }

  // 6) Data qatorlarini yig'ish
  // "BOSHQALAR" ni allowed dan chiqaramiz — u faqat yig'ma sifatida qo'shiladi
  const OTHERS = "BOSHQALAR";
  const allowed = new Set(
    allowedCategoryNames.map(normalizeName).filter(n => n !== normalizeName(OTHERS))
  );
  const out: ParsedSalesBranchRow[] = [];
  const skipped = new Set<string>();
  // Tanilmagan kategoriyalar summasi: branchAlias → { amount, cost }
  const othersMap = new Map<string, { amount: number; cost: number | null }>();

  for (let i = dataStartIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = r[1];
    if (typeof name !== "string") continue;

    const norm = normalizeName(name);
    const effective = categoryMapping?.get(norm) ?? norm;
    if (!allowed.has(effective)) {
      if (typeof r[0] === "number") {
        skipped.add(norm);
        // Tanilmagan kategoriya → summalaymiz
        for (const { salesIndex, costIndex, alias } of branchCols) {
          const amt = parseAmount(r[salesIndex]);
          if (amt == null || amt === 0) continue;
          const costAmt = costIndex != null ? (parseAmount(r[costIndex]) ?? null) : null;
          const prev = othersMap.get(alias);
          othersMap.set(alias, {
            amount: (prev?.amount ?? 0) + amt,
            cost: costAmt != null || prev?.cost != null
              ? ((prev?.cost ?? 0) + (costAmt ?? 0))
              : null,
          });
        }
      }
      continue;
    }

    for (const { salesIndex, costIndex, alias } of branchCols) {
      const amt = parseAmount(r[salesIndex]);
      if (amt == null || amt === 0) continue;
      const cost = costIndex != null ? (parseAmount(r[costIndex]) ?? null) : null;
      out.push({
        branchAlias: alias,
        categoryName: effective,
        amount: amt,
        costAmount: cost,
      });
    }
  }

  // "BOSHQALAR" qatorlarini qo'shamiz (faqat "BOSHQALAR" DB'da bo'lsa)
  const othersAllowed = allowedCategoryNames.map(normalizeName).includes(normalizeName(OTHERS));
  if (othersAllowed) {
    for (const [alias, { amount, cost }] of othersMap) {
      out.push({
        branchAlias: alias,
        categoryName: OTHERS,
        amount,
        costAmount: cost && cost > 0 ? cost : null,
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
