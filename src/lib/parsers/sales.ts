import * as XLSX from "xlsx";
import {
  parseAmount,
  parseCode,
  parseRussianPeriod,
  normalizeName,
} from "./utils";

// ─── Shablon versiyasi ───────────────────────────────────────────────────────
// v1: faqat {Продажи} — eski bir ustunli format
// v2: {Продажи, Себестоимость} — kategoriya darajasi
// v3: {Остаток, Количество, Продажи, Себестоимость} — mahsulot (SKU) darajasi
export type TemplateVersion = "v1" | "v2" | "v3";

// ─── Kategoriya darajasi natijasi (v1/v2) ────────────────────────────────────
export type ParsedSalesBranchRow = {
  branchAlias: string;
  categoryName: string;
  amount: number;
  costAmount: number | null;
};

// ─── Mahsulot (SKU) darajasi natijasi (v3) ───────────────────────────────────
export type ParsedProductRow = {
  branchAlias: string;
  /** 1C mahsulot kodi */
  productCode: number;
  productName: string;
  /** Eng yaqin ota-kategoriya kodi (DB'da topilgan Category.code) */
  parentCategoryCode: number | null;
  stockQty: number | null;
  soldQty: number | null;
  amount: number;
  costAmount: number | null;
};

export type ParsedSalesResult =
  | {
      version: "v1" | "v2";
      periodStart: Date;
      periodEnd: Date;
      rows: ParsedSalesBranchRow[];
      skippedCategories: string[];
    }
  | {
      version: "v3";
      periodStart: Date;
      periodEnd: Date;
      productRows: ParsedProductRow[];
      /** Kategoriya qatorlar soni (audit) */
      categoryRowCount: number;
    };

// ─── Ichki tip: ustun → (filial, metrika) mapping ────────────────────────────
type MetricLabel = "Остаток" | "Количество" | "Продажи" | "Себестоимость";

interface ColMapping {
  colIndex: number;
  branchAlias: string;
  metric: MetricLabel;
}

// Ruxsat etilgan metrika yorliqlari
const ALLOWED_METRICS = new Set<string>([
  "Остаток",
  "Количество",
  "Продажи",
  "Себестоимость",
]);

// ─── Yordamchi: R5 da filial nomi yoki sana bloki ekanini aniqlash ───────────
function isBranchName(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const trimmed = v.trim();
  if (!trimmed) return false;
  // Sana formati: DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) return false;
  // Kod va Номенклатура ustunlarini o'tkazib yuborish
  if (
    trimmed.toLowerCase() === "код" ||
    trimmed.toLowerCase().startsWith("номенклатура")
  )
    return false;
  return true;
}

/**
 * R5 (filial qatori) + R6 (metrika qatori) asosida dinamik ustun mapping quradi.
 *
 * Yangi format (v3):
 *   R5: col2=Market MEGA, col6=31.05.2026(sana, tashlanadi), col10=GoldMart, ...
 *   R6: Остаток|Количество|Продажи|Себестоимость (har blok 4 ustun)
 *
 * Eski format (v2):
 *   R5: col2=Market MEGA, col4=GoldMart, ...
 *   R6: Продажи|Себестоимость (har blok 2 ustun)
 *
 * Eng eski format (v1):
 *   R5: col2=Market MEGA, col3=GoldMart, ...
 *   R6: Продажи (har blok 1 ustun)
 *
 * "Итого" nomli bloklar va sana bloklar tashlanadi.
 */
function buildColumnMapping(
  branchRow: (unknown | null)[],
  metricRow: (unknown | null)[]
): { mappings: ColMapping[]; version: TemplateVersion } {
  const mappings: ColMapping[] = [];
  let currentBranch: string | null = null;

  for (let c = 2; c < branchRow.length; c++) {
    const branchVal = branchRow[c];
    const metricVal = metricRow[c];

    // Agar bu ustunda filial nomi bo'lsa — yangi filial bloki boshlanadi
    if (isBranchName(branchVal)) {
      const alias = (branchVal as string).trim();
      // "Итого" (grand total) va sana-dublikat ustunlari ("30.05.2026" —
      // bir kunlik davr uchun 1C filial ustunini takrorlaydi) filial EMAS — tashlanadi.
      const isDateHeader = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(alias);
      if (alias.toLowerCase() === "итого" || isDateHeader) {
        currentBranch = null;
      } else {
        currentBranch = alias;
      }
      // Filial nomli ustunning o'zi ham metrika bo'lishi mumkin
      // (v2 da R5 da filial nomi, R6 da "Продажи" — bir ustunda)
    }

    if (!currentBranch) continue;

    // Metrika yorlig'ini tekshirish
    const metricStr =
      typeof metricVal === "string" ? metricVal.trim() : null;
    if (!metricStr) continue;

    if (!ALLOWED_METRICS.has(metricStr)) {
      throw new Error(
        `Kutilmagan metrika yorlig'i "${metricStr}" (ustun ${c}). ` +
          `Ruxsat etilganlar: ${[...ALLOWED_METRICS].join(", ")}. ` +
          `Fayl tuzilishini tekshiring.`
      );
    }

    mappings.push({
      colIndex: c,
      branchAlias: currentBranch,
      metric: metricStr as MetricLabel,
    });
  }

  if (mappings.length === 0) {
    throw new Error(
      "Filial/metrika ustunlari topilmadi. R5/R6 header qatorlarini tekshiring."
    );
  }

  // Versiyani metrika to'plamidan aniqlash
  const metrics = new Set(mappings.map((m) => m.metric));
  let version: TemplateVersion;
  if (
    metrics.has("Остаток") &&
    metrics.has("Количество") &&
    metrics.has("Продажи") &&
    metrics.has("Себестоимость")
  ) {
    version = "v3";
  } else if (metrics.has("Продажи") && metrics.has("Себестоимость")) {
    version = "v2";
  } else if (metrics.has("Продажи")) {
    version = "v1";
  } else {
    throw new Error(
      `Noma'lum metrika to'plami: {${[...metrics].join(", ")}}. ` +
        `Kutilgan: {Продажи} yoki {Продажи,Себестоимость} yoki to'liq to'rt metrika.`
    );
  }

  return { mappings, version };
}

/**
 * Sotuv Excel faylini parse qiladi.
 *
 * v1/v2 (kategoriya darajasi):
 *   allowedCategoryNames va categoryMapping ixtiyoriy.
 *   ParsedSalesResult.version = "v1" | "v2", .rows = ParsedSalesBranchRow[].
 *
 * v3 (mahsulot/SKU darajasi):
 *   categoryCodes = DB'dan olingan Category.code to'plami (iyerarxiya aniqlash uchun).
 *   ParsedSalesResult.version = "v3", .productRows = ParsedProductRow[].
 */
export function parseSalesWorkbook(
  buffer: Buffer,
  allowedCategoryNames: string[],
  categoryMapping?: Map<string, string>,
  /** v3 uchun: DB'dan olingan Category.code to'plami */
  categoryCodes?: Set<number>,
  /** Davrni qo'lda berish (kunlik fayl) — berilsa, fayl sarlavhasi qidirilmaydi. */
  periodOverride?: { start: Date; end: Date }
): ParsedSalesResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("Excel ichida birorta varaq topilmadi.");

  const rows = XLSX.utils.sheet_to_json<(unknown | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });

  // ── 1. Period: qo'lda berilsa o'shani, aks holda fayl sarlavhasidan ──────────
  let period: { start: Date; end: Date } | null = periodOverride ?? null;
  if (!period) {
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
  }
  if (!period) {
    throw new Error(
      'Sotuv sanasi aniqlanmadi. Yuklashda sanani qo\'lda kiriting (yoki faylда "за период с … по …" sarlavhasi bo\'lsin).'
    );
  }

  // ── 2. Header qatorini topish: "Код" va "Номенклатура" ───────────────────
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = r[0];
    const b = r[1];
    if (
      typeof a === "string" &&
      typeof b === "string" &&
      a.trim().toLowerCase() === "код" &&
      b.trim().toLowerCase().startsWith("номенклатура")
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "Sotuv faylida header qatori (Код | Номенклатура | ...) topilmadi."
    );
  }

  // ── 3. Dinamik header mapping ─────────────────────────────────────────────
  // R(headerIdx)   = filial qatori (R5 yangi formatda)
  // R(headerIdx+1) = metrika qatori (R6)
  // R(headerIdx+2) = "Сумма" qatori (R7, o'tkazib yuboriladi)
  const branchRow = rows[headerIdx] as (unknown | null)[];
  const metricRow =
    headerIdx + 1 < rows.length
      ? (rows[headerIdx + 1] as (unknown | null)[])
      : [];

  const { mappings, version } = buildColumnMapping(branchRow, metricRow);

  // Data qatori boshlanishi: header dan keyin sub-headerlarni o'tkazib yuborish
  let dataStartIdx = headerIdx + 1;
  while (dataStartIdx < rows.length) {
    const r = rows[dataStartIdx];
    const a = r?.[0];
    const looksLikeSubHeader =
      a == null &&
      r?.some(
        (v) =>
          typeof v === "string" &&
          ["продажи", "себестоимость", "сумма", "остаток", "количество"].includes(
            v.trim().toLowerCase()
          )
      );
    if (looksLikeSubHeader) dataStartIdx++;
    else break;
  }

  // ── 4. v3 format: mahsulot darajasi ──────────────────────────────────────
  if (version === "v3") {
    return parseProductLevel(
      rows,
      dataStartIdx,
      period,
      mappings,
      categoryCodes ?? new Set()
    );
  }

  // ── 5. v1/v2 format: kategoriya darajasi (mavjud mantiq) ─────────────────
  const allowed = new Set(allowedCategoryNames.map(normalizeName));
  const out: ParsedSalesBranchRow[] = [];
  const skipped = new Set<string>();

  // Filial bo'yicha ustun indekslarini mapping dan ajratish
  const branchCols = buildLegacyBranchCols(mappings);

  for (let i = dataStartIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = r[1];
    if (typeof name !== "string") continue;

    const norm = normalizeName(name);
    const effective = categoryMapping?.get(norm) ?? norm;
    if (!allowed.has(effective)) {
      if (typeof r[0] === "number") skipped.add(norm);
      continue;
    }

    for (const { alias, salesIndex, costIndex } of branchCols) {
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

  if (out.length === 0) {
    throw new Error(
      "Faylda hech qaysi kerakli kategoriya topilmadi. Bo'limlar ro'yxatini tekshiring."
    );
  }

  return {
    version,
    periodStart: period.start,
    periodEnd: period.end,
    rows: out,
    skippedCategories: [...skipped],
  };
}

// ─── Yordamchi: v1/v2 uchun eski mapping tuzilmasiga o'tkazish ───────────────
function buildLegacyBranchCols(mappings: ColMapping[]): {
  alias: string;
  salesIndex: number;
  costIndex: number | null;
}[] {
  // Filial bo'yicha guruhlaymiz
  const byBranch = new Map<string, ColMapping[]>();
  for (const m of mappings) {
    if (!byBranch.has(m.branchAlias)) byBranch.set(m.branchAlias, []);
    byBranch.get(m.branchAlias)!.push(m);
  }

  return [...byBranch.entries()].map(([alias, cols]) => {
    const salesCol = cols.find((c) => c.metric === "Продажи");
    const costCol = cols.find((c) => c.metric === "Себестоимость");
    if (!salesCol) {
      throw new Error(
        `Filial "${alias}" uchun "Продажи" ustuni topilmadi.`
      );
    }
    return {
      alias,
      salesIndex: salesCol.colIndex,
      costIndex: costCol?.colIndex ?? null,
    };
  });
}

// ─── v3 parse: mahsulot darajasi ─────────────────────────────────────────────
function parseProductLevel(
  rows: (unknown | null)[][],
  dataStartIdx: number,
  period: { start: Date; end: Date },
  mappings: ColMapping[],
  categoryCodes: Set<number>
): Extract<ParsedSalesResult, { version: "v3" }> {
  // Filial bo'yicha indekslar
  const branchMetrics = new Map<
    string,
    {
      stockIdx: number | null;
      qtyIdx: number | null;
      salesIdx: number | null;
      costIdx: number | null;
    }
  >();

  for (const m of mappings) {
    if (!branchMetrics.has(m.branchAlias)) {
      branchMetrics.set(m.branchAlias, {
        stockIdx: null,
        qtyIdx: null,
        salesIdx: null,
        costIdx: null,
      });
    }
    const entry = branchMetrics.get(m.branchAlias)!;
    if (m.metric === "Остаток") entry.stockIdx = m.colIndex;
    else if (m.metric === "Количество") entry.qtyIdx = m.colIndex;
    else if (m.metric === "Продажи") entry.salesIdx = m.colIndex;
    else if (m.metric === "Себестоимость") entry.costIdx = m.colIndex;
  }

  // ── Data qatorlarini yig'ish (kod=raqam, nom=matn) ──────────────────────────
  // 1C eksporti tekis daraxt: ierarxiya qatorlari (MARKET/FOOD/.../DON) SUBTOTAL,
  // mahsulot (SKU) qatorlari — barg (leaf). Daraja markeri yo'q (outline/indent yo'q),
  // shuning uchun GROUP vs LEAF ni SUBTOTAL orqali qayta quramiz:
  // qator GROUP, agar uning Продажи (umumiy) qiymati o'zidan keyingi ketma-ket
  // qatorlar yig'indisiga teng bo'lsa (parent bolalardan oldin keladi).
  const salesIdxs = mappings.filter((m) => m.metric === "Продажи").map((m) => m.colIndex);
  const totalOf = (r: (unknown | null)[]) =>
    salesIdxs.reduce((s, idx) => s + (parseAmount(r[idx]) ?? 0), 0);

  type DataRow = { r: (unknown | null)[]; code: number; name: string; total: number };
  const data: DataRow[] = [];
  // Pastdagi "Итого" (grand total) qatori — validatsiya uchun (leaf emas).
  let totalRow: (unknown | null)[] | null = null;
  for (let i = dataStartIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const rawCode = r[0];
    const name = r[1];
    if (typeof rawCode === "string" && rawCode.trim().toLowerCase() === "итого") {
      totalRow = r;
      continue;
    }
    // 1C kodi 1000 dan katta bo'lsa probelli matn ("50 911") — parseCode ikkalasini ham oladi.
    // (Oldin typeof !== "number" tashlanardi → katta kodli SKUlar yo'qolardi.)
    const code = parseCode(rawCode);
    if (code == null || typeof name !== "string") continue;
    // Nomdagi ketma-ket/ortiqcha bo'shliqlar bittaga (1C eksporti shovqini) — toza nom.
    data.push({ r, code, name: name.replace(/\s+/g, " ").trim(), total: totalOf(r) });
  }

  const n = data.length;
  const isGroup = new Array<boolean>(n).fill(false);

  // GROUP (papka/subtotal) = kodi DB iyerarxiyasida bor (guruh∪kategoriya∪subkat).
  // ShablonSotuv faqat SKU bo'ladi (papka yo'q) → hech biri group emas, hammasi leaf.
  // Kategoriya har SKU uchun master'dan (Product.categoryId) olinadi — fayldan emas.
  for (let i = 0; i < n; i++) {
    if (categoryCodes.has(data[i].code)) isGroup[i] = true;
  }

  // ── Leaf (SKU) lardan ProductSales qatorlari + kategoriya biriktirish ───────
  const productRows: ParsedProductRow[] = [];
  let categoryRowCount = 0;
  let currentCategoryCode: number | null = null; // eng yaqin BIZGA MA'LUM kategoriya/subkategoriya

  for (let i = 0; i < n; i++) {
    const d = data[i];
    if (isGroup[i]) {
      categoryRowCount++;
      // Faqat DB'da mavjud (Category.code) GROUP'lar kategoriya biriktirishda ishtirok etadi.
      // Oraliq 1C guruhlari (DON, YORMA/KRUPA, MARKET root...) e'tiborga olinmaydi.
      if (categoryCodes.has(d.code)) currentCategoryCode = d.code;
      continue;
    }
    // Leaf (SKU) — har filial uchun bir qator (faqat sotuv > 0)
    for (const [branchAlias, cols] of branchMetrics) {
      if (cols.salesIdx == null) continue;
      const amount = parseAmount(d.r[cols.salesIdx]);
      if (amount == null || amount === 0) continue;
      const stockQty = cols.stockIdx != null ? (parseAmount(d.r[cols.stockIdx]) ?? null) : null;
      const soldQty = cols.qtyIdx != null ? (parseAmount(d.r[cols.qtyIdx]) ?? null) : null;
      const costAmount = cols.costIdx != null ? (parseAmount(d.r[cols.costIdx]) ?? null) : null;
      productRows.push({
        branchAlias,
        productCode: d.code,
        productName: d.name,
        parentCategoryCode: currentCategoryCode,
        stockQty,
        soldQty,
        amount,
        costAmount,
      });
    }
  }

  // ── VALIDATSIYA: leaf (SKU) yig'indisi == fayldagi "Итого" qatori — har filial ──
  // Faqat fayl "Итого" (grand total) qatorini bersa tekshiramiz. ShablonSotuv leaf-only
  // bo'lgani uchun bu yig'indi Итого bilan deyarli aniq mos kelishi kerak; katta farq —
  // qo'sh hisob (papka qatori SKU deb sanalgan) belgisidir.
  if (totalRow) {
    for (const [alias, cols] of branchMetrics) {
      if (cols.salesIdx == null) continue;
      const sIdx: number = cols.salesIdx;
      const expected = parseAmount(totalRow[sIdx]) ?? 0;
      if (expected <= 0) continue;
      let leafSum = 0;
      for (let i = 0; i < n; i++) {
        if (!isGroup[i]) leafSum += parseAmount(data[i].r[sIdx]) ?? 0;
      }
      // 0.001% (min 1000 so'm) — 1C yaxlitlashi satr boshiga ≤1 tiyin, demak bu ham keng.
      // Eski 0.1% milliardlik filialda 10 mln'lik oynani o'tkazib yuborardi — qo'sh hisob
      // (papka qatori SKU deb sanalishi) aynan shu o'lchamda bo'ladi.
      const tol = Math.max(1000, Math.abs(expected) * 0.00001);
      if (Math.abs(leafSum - expected) > tol) {
        const farq = leafSum - expected;
        const nomzodlar = data
          .map((d, i) => ({ d, i, total: parseAmount(d.r[sIdx]) ?? 0 }))
          .filter((x) => !isGroup[x.i] && x.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 15)
          .map((x) => `  • ${x.d.code} — ${x.d.name} (${x.total.toLocaleString("ru-RU")})`)
          .join("\n");
        throw new Error(
          `Validatsiya xato: "${alias}" SKU yig'indisi (${leafSum.toFixed(2)}) ` +
            `fayldagi "Итого" (${expected.toFixed(2)}) bilan teng emas — farq ${farq.toFixed(2)}.\n\n` +
            `Eng katta SKU qatorlari (tekshiring):\n${nomzodlar}`
        );
      }
    }
  }

  return {
    version: "v3",
    periodStart: period.start,
    periodEnd: period.end,
    productRows,
    categoryRowCount,
  };
}
