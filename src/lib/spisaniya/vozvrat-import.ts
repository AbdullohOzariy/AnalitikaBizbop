/**
 * Vozvrat (qaytarish) Excel import parseri — array-of-arrays (sheet_to_json header:1) dan
 * vozvrat qatorlarini ajratadi. Ustunlar sarlavha bo'yicha aniqlanadi; sarlavha qatori
 * dinamik topiladi (tepada izoh/sarlavha qatorlari bo'lishi mumkin).
 * Majburiy: Tovar, Miqdor, Filial. Summa ixtiyoriy (yo'q — 0). Yo'nalish/Ta'minotchi/Birlik/Sabab ixtiyoriy.
 */

export type VozvratImportRow = {
  tovar: string;
  miqdor: number;
  summa: number;
  filial: string;
  birlik?: string;
  sabab?: string;
  yonalish?: "asosiy_filial" | "taminotchi";
  taminotchi?: string;
};

const COL = {
  tovar: /tovar|mahsulot|^nom|nomi|товар|наимен/i,
  miqdor: /miqdor|^son|soni|kol|qty|кол/i,
  summa: /summa|narx|qiymat|amount|сумма|^сум/i,
  filial: /filial|do.?kon|magazin|филиал|branch/i,
  birlik: /birlik|o.?lchov|^ed|unit|изм/i,
  sabab: /sabab|izoh|reason|причин/i,
  yonalish: /yo.?nalish|направл/i,
  taminotchi: /ta.?minot|postavsh|поставщ|supplier|yetkaz/i,
} as const;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

type ColMap = Partial<Record<keyof typeof COL, number>>;

/** Qatorda ustunlarni sarlavha regexlari bo'yicha topadi. */
function detectCols(row: unknown[]): ColMap {
  const m: ColMap = {};
  row.forEach((cell, i) => {
    const h = str(cell).toLowerCase();
    if (!h) return;
    for (const key of Object.keys(COL) as (keyof typeof COL)[]) {
      if (m[key] === undefined && COL[key].test(h)) m[key] = i;
    }
  });
  return m;
}

export function parseVozvratRows(aoa: unknown[][]): VozvratImportRow[] {
  if (!aoa.length) return [];
  // Sarlavha qatorini topish: Tovar + (Miqdor yoki Summa) bo'lgan birinchi qator (dastlabki 15 qator).
  let headerIdx = -1;
  let cols: ColMap = {};
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const c = detectCols(aoa[i] ?? []);
    if (c.tovar !== undefined && (c.miqdor !== undefined || c.summa !== undefined) && c.filial !== undefined) {
      headerIdx = i; cols = c; break;
    }
  }
  // Sarlavha topilmasa — 1-qator sarlavha, ustunlar standart tartibda
  if (headerIdx === -1) {
    headerIdx = 0;
    cols = { tovar: 0, miqdor: 1, summa: 2, filial: 3, birlik: 4, sabab: 5 };
  }

  const out: VozvratImportRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const tovar = str(row[cols.tovar ?? 0]);
    const miqdor = toNum(row[cols.miqdor ?? 1]);
    const filial = str(cols.filial !== undefined ? row[cols.filial] : "");
    if (!tovar || miqdor == null || miqdor <= 0 || !filial) continue;
    const summa = (cols.summa !== undefined ? toNum(row[cols.summa]) : null) ?? 0;
    const birlik = cols.birlik !== undefined ? str(row[cols.birlik]) : "";
    const sabab = cols.sabab !== undefined ? str(row[cols.sabab]) : "";
    const yonRaw = cols.yonalish !== undefined ? str(row[cols.yonalish]).toLowerCase() : "";
    const taminotchi = cols.taminotchi !== undefined ? str(row[cols.taminotchi]) : "";
    const yonalish: "asosiy_filial" | "taminotchi" =
      /ta.?minot|postavsh|поставщ|yetkaz/.test(yonRaw) || (!yonRaw && taminotchi) ? "taminotchi" : "asosiy_filial";
    out.push({
      tovar, miqdor, summa, filial,
      birlik: birlik || undefined,
      sabab: sabab || undefined,
      yonalish,
      taminotchi: taminotchi || undefined,
    });
  }
  return out;
}
