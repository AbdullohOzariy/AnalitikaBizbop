import * as XLSX from "xlsx";
import { parseAmount, parseDate, parseRussianPeriod } from "./utils";

export type ParsedDailyMetric = {
  date: Date;
  receiptCount: number;
  receiptTotal: number;
  avgItemsPerReceipt: number;
  avgReceipt: number;
  bigPurchaseLevel: number;
  smallPurchaseLevel: number;
};

export type ParsedMetricsResult = {
  periodStart: Date;
  periodEnd: Date;
  metrics: ParsedDailyMetric[];
};

/**
 * sr.xlsx — "Средний чек за период с ... по ..." formati.
 *
 * Layout:
 *  - Row 0: sarlavha
 *  - Row 2: [null, date1, date2, ..., 'Итого']
 *  - Row 3: ['Количество чеков', val1, val2, ..., итого]
 *  - Row 4: ['Сумма чеков', ...]
 *  - Row 5: ['Среднее количество товаров в чеке', ...]
 *  - Row 6: ['Средний чек', ...]
 *  - Row 7: ['Уровень больших покупок', ...]
 *  - Row 8: ['Уровень мелких покупок', ...]
 *
 * Filial fayl ichida ko'rsatilmaydi — uploadda majburiy tanlanadi.
 */
const METRIC_LABELS: Record<string, keyof ParsedDailyMetric> = {
  "количество чеков": "receiptCount",
  "сумма чеков": "receiptTotal",
  "среднее количество товаров в чеке": "avgItemsPerReceipt",
  "средний чек": "avgReceipt",
  "уровень больших покупок": "bigPurchaseLevel",
  "уровень мелких покупок": "smallPurchaseLevel",
};

export function parseMetricsWorkbook(buffer: Buffer): ParsedMetricsResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Excel ichida birorta varaq topilmadi.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  // 1) Period
  let period: { start: Date; end: Date } | null = null;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
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
      "Metrika faylida period sarlavhasi topilmadi (\"Средний чек за период ...\")."
    );
  }

  // 2) Sanalar qatorini topish: birinchi cell null bo'lib, qolganlari date bo'lgan qator
  let dateRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!r || r[0] != null) continue;
    const dateCount = r.filter((v) => v instanceof Date || parseDate(v)).length;
    if (dateCount >= 3) {
      dateRowIdx = i;
      break;
    }
  }
  if (dateRowIdx === -1) {
    throw new Error("Sanalar qatori topilmadi.");
  }

  const dateRow = rows[dateRowIdx];
  const dateColumns: { index: number; date: Date }[] = [];
  for (let c = 1; c < dateRow.length; c++) {
    const d = parseDate(dateRow[c]);
    if (d) dateColumns.push({ index: c, date: d });
  }
  if (dateColumns.length === 0) throw new Error("Header qatorida sanalar topilmadi.");

  // 3) Har bir metrikaga qator topish (birinchi cell label bilan)
  const valuesByDate = new Map<string, Partial<ParsedDailyMetric>>();
  for (let i = dateRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const label = r[0];
    if (typeof label !== "string") continue;
    const key = label.trim().toLowerCase();
    const field = METRIC_LABELS[key];
    if (!field) continue;

    for (const { index, date } of dateColumns) {
      const v = parseAmount(r[index]);
      if (v == null) continue;
      const isoDate = date.toISOString().slice(0, 10);
      const cur = valuesByDate.get(isoDate) ?? { date };
      // @ts-expect-error — dynamic assignment
      cur[field] = field === "receiptCount" ? Math.round(v) : v;
      valuesByDate.set(isoDate, cur);
    }
  }

  const metrics: ParsedDailyMetric[] = [];
  const REQUIRED: (keyof ParsedDailyMetric)[] = [
    "receiptCount",
    "receiptTotal",
    "avgItemsPerReceipt",
    "avgReceipt",
    "bigPurchaseLevel",
    "smallPurchaseLevel",
  ];
  for (const partial of valuesByDate.values()) {
    if (!partial.date) continue;
    if (REQUIRED.some((k) => partial[k] == null)) continue;
    metrics.push(partial as ParsedDailyMetric);
  }

  if (metrics.length === 0) {
    throw new Error("To'liq kunlik metrika qatorlari topilmadi.");
  }

  metrics.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { periodStart: period.start, periodEnd: period.end, metrics };
}
