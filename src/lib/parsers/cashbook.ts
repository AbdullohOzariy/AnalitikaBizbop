/**
 * "Касса-Асосий" kassa kitobi parseri (Google Sheets → .xlsx).
 *
 * Manba tuzilishi (varaq "Касса"):
 *   sarlavha ustida — jami qatori: ... | Кирим jami | Чиқим jami | farq
 *   sarlavha:  Сана | Касса | Кимдан олинган ёки кимга берилган | Контрагент |
 *              Изоҳ | Статья ДДС | Кирим | Чиқим | Қолдиқ
 *
 * MUHIM QARORLAR:
 *  • "Қолдиқ" ustuni O'QILMAYDI — u global running total, biz qayta hisoblaymiz.
 *    Faqat VALIDATSIYA uchun tekshiriladi (prev + in − out = qoldiq).
 *  • Bir qatorda ham Кирим ham Чиқим bo'lsa — IKKI yozuv (netting), ikkalasi ham
 *    saqlanadi va qator "both_directions" sifatida ko'rikka tushadi.
 *  • "Остатка" moddasi CashTxn EMAS — davr boshi qoldig'i (aylanma shishmasin).
 *  • Tanilmagan kassa/modda — qator YO'QOTILMAYDI, moslanmaganlar ro'yxatiga tushadi.
 */
import * as XLSX from "xlsx";
import { parseAmount, sha256, normalizeName } from "./utils";

export const OSTATKA_ALIASES = ["остатка", "остаток"];

export type CashbookRow = {
  rowNo: number;
  rawDate: string;
  date: Date | null;
  rawDesk: string;
  rawPerson: string;
  rawCounterparty: string;
  rawNote: string;
  rawArticle: string;
  amountIn: number | null;
  amountOut: number | null;
  /** Manbadagi "Қолдиқ" — faqat izchillikni tekshirish uchun. */
  rawBalance: number | null;
};

export type CashbookParseResult = {
  fileHash: string;
  sheetName: string;
  rows: CashbookRow[];
  /** Sarlavha ustidagi jami qatori (checksum uchun). Topilmasa null. */
  sourceSumIn: number | null;
  sourceSumOut: number | null;
  /** Biz o'qigan qatorlardan hisoblangan jami. */
  parsedSumIn: number;
  parsedSumOut: number;
  /** Qoldiq izchilligi buzilgan qatorlar (manba buzuq bo'lsa) — ogohlantirish. */
  balanceBreaks: number[];
};

const HEADER_KEYS = ["сана", "касса", "статья"];

/** Sarlavha qatorini ustun nomlariga qarab topadi (joyi faylda siljishi mumkin). */
function findHeader(grid: unknown[][]): number {
  for (let i = 0; i < Math.min(grid.length, 50); i++) {
    const cells = (grid[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    const hit = HEADER_KEYS.filter((k) => cells.some((c) => c.includes(k))).length;
    if (hit >= 3) return i;
  }
  return -1;
}

/** Sarlavhadagi ustun indekslari — nomlar biroz o'zgarsa ham topiladi. */
function columnMap(header: unknown[]): Record<string, number> {
  const norm = header.map((c) => String(c ?? "").trim().toLowerCase());
  const find = (...keys: string[]) => norm.findIndex((c) => keys.some((k) => c.includes(k)));
  return {
    date: find("сана", "дата"),
    desk: find("касса"),
    person: find("кимдан", "кимга"),
    counterparty: find("контрагент"),
    note: find("изо", "изох", "примеч"),
    article: find("статья", "модда"),
    in: find("кирим", "приход"),
    out: find("чиқим", "чиким", "расход"),
    balance: find("қолдиқ", "колдик", "остаток"),
  };
}

/** 1C/Excel sanasi: serial raqam yoki "DD.MM.YYYY". */
export function parseCashDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel serial (1900 tizimi) → UTC yarim tun
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 ? null : new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    );
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    // Rollover tekshiruvi: "31.02.2026" jimgina martga surilmasin
    if (d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null;
    return d;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Jami qatorini sarlavhadan YUQORIDA izlaydi (Кирим/Чиқим ustunlari bo'yicha). */
function findSourceTotals(
  grid: unknown[][],
  headerIdx: number,
  col: Record<string, number>
): { in: number | null; out: number | null } {
  for (let i = headerIdx - 1; i >= 0 && i >= headerIdx - 5; i--) {
    const row = grid[i] ?? [];
    const a = parseAmount(row[col.in]);
    const b = parseAmount(row[col.out]);
    // Jami qatorida ikkala qiymat ham katta bo'ladi (mln'lab) va matn yo'q
    if (a != null && b != null && a > 0 && b > 0) return { in: a, out: b };
  }
  return { in: null, out: null };
}

export function parseCashbook(buffer: Buffer): CashbookParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // Varaqni topamiz: nomi "Касса" bo'lgani yoki sarlavhasi mos kelgani
  let sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase().includes("касса")) ?? "";
  let grid: unknown[][] = [];
  let headerIdx = -1;

  const candidates = sheetName ? [sheetName, ...wb.SheetNames] : wb.SheetNames;
  for (const name of candidates) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const g = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const idx = findHeader(g);
    if (idx >= 0) {
      sheetName = name;
      grid = g;
      headerIdx = idx;
      break;
    }
  }

  if (headerIdx < 0) {
    throw new Error(
      "Kassa varag'i topilmadi. Sarlavhada «Сана», «Касса», «Статья ДДС» ustunlari bo'lishi kerak."
    );
  }

  const col = columnMap(grid[headerIdx]);
  if (col.date < 0 || col.desk < 0 || col.article < 0 || col.in < 0 || col.out < 0) {
    throw new Error("Kerakli ustunlar topilmadi (Сана / Касса / Статья ДДС / Кирим / Чиқим).");
  }

  const totals = findSourceTotals(grid, headerIdx, col);
  const rows: CashbookRow[] = [];
  const balanceBreaks: number[] = [];
  let parsedSumIn = 0;
  let parsedSumOut = 0;
  let prevBalance: number | null = null;

  const txt = (v: unknown) => String(v ?? "").trim();

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const amountIn = parseAmount(r[col.in]);
    const amountOut = parseAmount(r[col.out]);
    const rawDesk = txt(r[col.desk]);
    const rawArticle = col.article >= 0 ? txt(r[col.article]) : "";

    // Butunlay bo'sh qator — o'tkazamiz (jadval oxiridagi bo'shliqlar)
    if (!rawDesk && !rawArticle && amountIn == null && amountOut == null) continue;

    const rawDate = txt(r[col.date]);
    const date = parseCashDate(r[col.date]);
    const rawBalance = col.balance >= 0 ? parseAmount(r[col.balance]) : null;

    // Qoldiq izchilligi: prev + in − out = qoldiq. Buzilsa manba buzuq degani.
    if (rawBalance != null && prevBalance != null) {
      const kutilgan = prevBalance + (amountIn ?? 0) - (amountOut ?? 0);
      if (Math.abs(kutilgan - rawBalance) > 1) balanceBreaks.push(i + 1);
    }
    if (rawBalance != null) prevBalance = rawBalance;

    parsedSumIn += amountIn ?? 0;
    parsedSumOut += amountOut ?? 0;

    rows.push({
      rowNo: i + 1,
      rawDate,
      date,
      rawDesk,
      rawPerson: col.person >= 0 ? txt(r[col.person]) : "",
      rawCounterparty: col.counterparty >= 0 ? txt(r[col.counterparty]) : "",
      rawNote: col.note >= 0 ? txt(r[col.note]) : "",
      rawArticle,
      amountIn,
      amountOut,
      rawBalance,
    });
  }

  return {
    fileHash: sha256(buffer),
    sheetName,
    rows,
    sourceSumIn: totals.in,
    sourceSumOut: totals.out,
    parsedSumIn,
    parsedSumOut,
    balanceBreaks,
  };
}

/** Modda "Остатка"mi — bunday qator CashTxn emas, davr boshi qoldig'i. */
export function isOstatka(article: string): boolean {
  const n = normalizeName(article).toLowerCase();
  return OSTATKA_ALIASES.some((a) => n === a);
}

/** Qator qanday yo'nalish(lar)ni bildiradi. */
export function directionsOf(row: CashbookRow): ("IN" | "OUT")[] {
  const hasIn = (row.amountIn ?? 0) > 0;
  const hasOut = (row.amountOut ?? 0) > 0;
  if (hasIn && hasOut) return ["IN", "OUT"]; // netting — ikki yozuv
  if (hasIn) return ["IN"];
  if (hasOut) return ["OUT"];
  return [];
}
