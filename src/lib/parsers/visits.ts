import * as XLSX from "xlsx";
import { parseUzDayMonth } from "./utils";

export type ParsedVisitRow = {
  branchAlias: string;
  date: Date;
  count: number;
};

export type ParsedVisitsResult = {
  rows: ParsedVisitRow[];
};

/**
 * export (1).xlsx — kunlik tashriflar.
 *
 * Layout:
 *   Row 0: [null, 'Filial', '01 aprel', '02 aprel', ..., 'Jami']
 *   Row 1+: [null, 'Goldmart', n1, n2, ..., total]
 *
 * Yil fayl ichida ko'rsatilmaydi — uploadda admin tomonidan tanlanadi.
 */
export function parseVisitsWorkbook(buffer: Buffer, year: number): ParsedVisitsResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Excel ichida birorta varaq topilmadi.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  // 1) Header qator: Filial ustuni va sana ustunlari
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i];
    if (!r) continue;
    const hasFilial = r.some(
      (v) => typeof v === "string" && v.trim().toLowerCase() === "filial"
    );
    if (hasFilial) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("Tashriflar faylida 'Filial' header topilmadi.");
  }
  const headerRow = rows[headerIdx];

  let filialColIdx = -1;
  for (let c = 0; c < headerRow.length; c++) {
    if (
      typeof headerRow[c] === "string" &&
      (headerRow[c] as string).trim().toLowerCase() === "filial"
    ) {
      filialColIdx = c;
      break;
    }
  }

  // Sana ustunlarini aniqlash
  const dateCols: { index: number; date: Date }[] = [];
  for (let c = filialColIdx + 1; c < headerRow.length; c++) {
    const v = headerRow[c];
    if (typeof v !== "string") continue;
    if (v.trim().toLowerCase() === "jami") continue;
    const d = parseUzDayMonth(v, year);
    if (d) dateCols.push({ index: c, date: d });
  }
  if (dateCols.length === 0) {
    throw new Error("Tashriflar fayl headerida sanalar topilmadi.");
  }

  // 2) Data qatorlari
  const out: ParsedVisitRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const alias = r[filialColIdx];
    if (typeof alias !== "string" || !alias.trim()) continue;

    for (const { index, date } of dateCols) {
      const v = r[index];
      if (v == null || v === "") continue;
      const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) continue;
      // Tashrif soni butun va manfiy emas bo'lishi shart — haqiqiy kesirli/manfiy
      // qiymat xato ma'lumot belgisi, jim yaxlitlab o'tkazmaymiz. Excel float
      // artefakti (1499.9999…) esa epsilon ichida butunga keltiriladi.
      const rounded = Math.round(n);
      if (n < 0 || Math.abs(n - rounded) > 1e-6) {
        throw new Error(
          `Tashriflar faylida noto'g'ri qiymat: "${alias.trim()}" / ${date.toISOString().slice(0, 10)} = ${n} (butun musbat son kutiladi).`
        );
      }
      out.push({
        branchAlias: alias.trim(),
        date,
        count: rounded,
      });
    }
  }

  if (out.length === 0) {
    throw new Error("Tashriflar fayldan birorta kunlik qator olinmadi.");
  }

  return { rows: out };
}
