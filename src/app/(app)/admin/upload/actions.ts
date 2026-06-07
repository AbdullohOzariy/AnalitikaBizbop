"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { FileType, AliasSource, UploadStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/auth-helpers";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { sha256 } from "@/lib/parsers/utils";
import { parseSalesWorkbook } from "@/lib/parsers/sales";
import { parseMetricsWorkbook } from "@/lib/parsers/metrics";
import { parseVisitsWorkbook } from "@/lib/parsers/visits";
import { parseDailyPlansWorkbook } from "@/lib/parsers/daily-plans";
import { matchCategoryNames, matchBranchAlias } from "@/lib/ai-matcher";

export type UploadResult =
  | { ok: true; fileId: number; summary: string; aiCorrections?: string[] }
  | { ok: false; error: string };

const labelSchema = z.string().trim().min(1, "Fayl uchun nom kiriting").max(120);

async function readBuffer(file: File): Promise<Buffer> {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes);
}

async function ensureNotDuplicate(hash: string) {
  const existing = await prisma.uploadedFile.findUnique({
    where: { fileHash: hash },
    select: { id: true, label: true, createdAt: true },
  });
  if (existing) {
    throw new Error(
      `Bu fayl avval yuklangan ("${existing.label}", ${existing.createdAt.toLocaleDateString("uz-UZ")}). Yangi nusxa yuklash uchun fayl ichini o'zgartiring.`
    );
  }
}

/**
 * Kirill/Lotin aralash harflardagi farqlarni yo'qotib normalizatsiya qiladi.
 * Masalan, Kirill 'О' (U+041E) == Lotin 'O' (U+004F) ko'rinishi bir xil lekin boshqa.
 */
function normalizeAlias(s: string): string {
  const cyToLat: Record<string, string> = {
    'А':'A','В':'B','С':'C','Е':'E','Н':'H','К':'K','М':'M',
    'О':'O','Р':'P','Т':'T','Х':'X','І':'I','Ї':'I',
    'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ї':'i',
  };
  return [...s.trim()]
    .map(c => cyToLat[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function resolveBranch(alias: string, source: AliasSource): Promise<number> {
  // 1. Case-insensitive DB lookup
  const a = await prisma.branchAlias.findFirst({
    where: { alias: { equals: alias.trim(), mode: "insensitive" }, source },
    select: { branchId: true },
  });
  if (a) return a.branchId;

  // 2. Homoglyph-normalized in-memory lookup (Kirill/Lotin aralash harflar uchun)
  const all = await prisma.branchAlias.findMany({
    where: { source },
    select: { branchId: true, alias: true },
  });
  const normIncoming = normalizeAlias(alias);
  const match = all.find(r => normalizeAlias(r.alias) === normIncoming);
  if (match) return match.branchId;

  throw new Error(`not_found:${alias}`);
}

/**
 * Avval DB'dan qidiradi. Topilmasa DeepSeek'ga so'raydi.
 * AI topsa — alias'ni DB'ga saqlaydi (keyingi yuklashlarda AI kerak bo'lmaydi).
 * @returns { branchId, aiUsed, branchName }
 */
async function resolveBranchWithAI(
  alias: string,
  source: AliasSource
): Promise<{ branchId: number; aiUsed: boolean; branchName: string }> {
  // 1. Aniq moslik
  try {
    const id = await resolveBranch(alias, source);
    const branch = await prisma.branch.findUnique({ where: { id }, select: { name: true } });
    return { branchId: id, aiUsed: false, branchName: branch?.name ?? "" };
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith("not_found:"))) throw e;
  }

  // 2. AI fallback
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error(
      `Filial nomi tanilmadi: "${alias}" (${source}). Filiallar bo'limidan alias qo'shing.`
    );
  }

  const branches = await prisma.branch.findMany({
    include: { aliases: { where: { source }, select: { alias: true } } },
  });
  const branchesForAI = branches.map((b) => ({
    id: b.id,
    name: b.name,
    existingAliases: b.aliases.map((a) => a.alias),
  }));

  const match = await matchBranchAlias(alias, branchesForAI).catch(() => null);
  if (!match) {
    const charCodes = [...alias].map(c => `${c}(${c.codePointAt(0)?.toString(16)})`).join('');
    throw new Error(
      `Filial nomi tanilmadi: "${alias}" (${source}). AI ham aniqlay olmadi — alias qo'shing.\nDebug: ${charCodes}`
    );
  }

  // 3. AI topgan aliasni DB'ga saqlash (keyingi safar AI kerak bo'lmaydi)
  await prisma.branchAlias.create({
    data: { branchId: match.branchId, alias: alias.trim(), source },
  }).catch(() => null); // unique constraint xatosini e'tiborsiz qoldirish

  return { branchId: match.branchId, aiUsed: true, branchName: match.branchName };
}

async function getCategoryMap(): Promise<Map<string, number>> {
  const cats = await prisma.category.findMany({ select: { id: true, name: true } });
  return new Map(cats.map((c) => [c.name, c.id]));
}

/** CategoryAlias jadvali orqali alias → DB kategoriya nomi (normalized). */
async function getCategoryAliasNameMap(): Promise<Map<string, string>> {
  const aliases = await prisma.categoryAlias.findMany({
    select: { alias: true, category: { select: { name: true } } },
  });
  return new Map(aliases.map((a) => [a.alias, a.category.name]));
}

// ============ SALES ============

const salesInputSchema = z.object({
  label: labelSchema,
  // Kunlik sotuv sanasi (qo'lda). Berilsa fayl sarlavhasi o'rniga ishlatiladi.
  period: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD").optional(),
});

/** "YYYY-MM-DD" → { start, end } (kunlik: start=end=o'sha kun). */
function periodFromInput(s: string | undefined): { start: Date; end: Date } | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? undefined : { start: dt, end: dt };
}

export async function uploadSalesAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdminUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    const parsed = salesInputSchema.parse({
      label: formData.get("label"),
      period: formData.get("period") || undefined,
    });
    const periodOverride = periodFromInput(parsed.period);

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const cats = await getCategoryMap();
    const catNames = [...cats.keys()];
    const aiCorrections: string[] = [];

    // DB'dan Category.code to'plamini olish (v3 uchun iyerarxiya aniqlash)
    const categoryCodeRecords = await prisma.category.findMany({
      select: { id: true, code: true },
    });
    const groupCodeRecords = await prisma.categoryGroup.findMany({
      select: { code: true },
    });
    // Ierarxiya qatorlarini tanish uchun: guruh ∪ kategoriya ∪ subkategoriya kodlari.
    const categoryCodes = new Set<number>([
      ...categoryCodeRecords.flatMap((c) => (c.code != null ? [c.code] : [])),
      ...groupCodeRecords.flatMap((g) => (g.code != null ? [g.code] : [])),
    ]);
    const categoryCodeToId = new Map<number, number>(
      categoryCodeRecords.flatMap((c) =>
        c.code != null ? [[c.code, c.id]] : []
      )
    );

    // 1. Birinchi parse — aniq mosliklar bilan (v3 uchun categoryCodes ham uzatiladi)
    const firstParse = parseSalesWorkbook(buf, catNames, undefined, categoryCodes, periodOverride);

    if (firstParse.version === "v3") {
      // ── v3: mahsulot (SKU) darajasi ──────────────────────────────────────
      return await uploadV3(
        firstParse,
        buf,
        hash,
        file,
        parsed,
        user,
        categoryCodeToId,
        aiCorrections
      );
    }

    // ── v1/v2: kategoriya darajasi ────────────────────────────────────────
    // Bu yerda firstParse.version = "v1" | "v2" — TypeScript toraytirishi to'g'ri
    type LegacyResult = Extract<
      ReturnType<typeof parseSalesWorkbook>,
      { version: "v1" | "v2" }
    >;
    let legacyResult: LegacyResult = firstParse;

    // 2. AI: noma'lum kategoriyalarni moslashtirish
    if (legacyResult.skippedCategories.length > 0 && process.env.DEEPSEEK_API_KEY) {
      const categoryMapping = await matchCategoryNames(
        legacyResult.skippedCategories,
        catNames
      ).catch(() => new Map<string, string>());

      if (categoryMapping.size > 0) {
        const reParsed = parseSalesWorkbook(buf, catNames, categoryMapping, categoryCodes, periodOverride);
        if (reParsed.version !== "v3") {
          legacyResult = reParsed;
        }
        for (const [excel, db] of categoryMapping) {
          aiCorrections.push(`Kategoriya: "${excel}" → "${db}"`);
        }
      }
    }

    // 3. Filial aliaslarini yechish (AI fallback bilan)
    const uniqueAliases = [...new Set(legacyResult.rows.map((r) => r.branchAlias))];
    const aliasToBranchId = new Map<string, number>();
    for (const alias of uniqueAliases) {
      const resolved = await resolveBranchWithAI(alias, AliasSource.SALES);
      aliasToBranchId.set(alias, resolved.branchId);
      if (resolved.aiUsed) {
        aiCorrections.push(
          `Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`
        );
      }
    }

    const fileRecord = await prisma.uploadedFile.create({
      data: {
        label: parsed.label,
        originalName: file.name,
        fileHash: hash,
        fileType: FileType.SALES,
        periodStart: legacyResult.periodStart,
        periodEnd: legacyResult.periodEnd,
        templateVersion: legacyResult.version,
        rowCount: legacyResult.rows.length,
        status: UploadStatus.SUCCESS,
        uploadedById: Number(user.id),
      },
    });

    try {
      const values = legacyResult.rows.map((row) => {
        const branchId = aliasToBranchId.get(row.branchAlias)!;
        const categoryId = cats.get(row.categoryName)!;
        const cost = row.costAmount != null ? new Prisma.Decimal(row.costAmount) : null;
        return Prisma.sql`(${fileRecord.id}, ${branchId}, ${categoryId}, ${legacyResult.periodStart}::date, ${legacyResult.periodEnd}::date, ${new Prisma.Decimal(row.amount)}, ${cost})`;
      });
      await prisma.$executeRaw`
        INSERT INTO "CategorySales" ("uploadedFileId", "branchId", "categoryId", "periodStart", "periodEnd", "amount", "costAmount")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("branchId", "categoryId", "periodStart", "periodEnd")
        DO UPDATE SET
          "uploadedFileId" = EXCLUDED."uploadedFileId",
          "amount"         = EXCLUDED."amount",
          "costAmount"     = EXCLUDED."costAmount"
      `;
    } catch (err) {
      await prisma.uploadedFile.delete({ where: { id: fileRecord.id } }).catch(() => null);
      throw err;
    }

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");

    const branchCount = uniqueAliases.length;
    return {
      ok: true,
      fileId: fileRecord.id,
      aiCorrections: aiCorrections.length > 0 ? aiCorrections : undefined,
      summary: `Saqlandi: ${legacyResult.rows.length} qator (${branchCount} filial), period ${legacyResult.periodStart.toISOString().slice(0, 10)} → ${legacyResult.periodEnd.toISOString().slice(0, 10)}.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Noma'lum xato." };
  }
}

// ─── v3 upload oqimi: Product upsert → ProductSales upsert → CategorySales derive ─

async function uploadV3(
  result: Extract<import("@/lib/parsers/sales").ParsedSalesResult, { version: "v3" }>,
  _buf: Buffer,
  hash: string,
  file: File,
  parsed: { label: string },
  user: { id: string | number },
  categoryCodeToId: Map<number, number>,
  aiCorrections: string[]
): Promise<UploadResult> {
  // 1. Filial aliaslarini yechish
  const uniqueAliases = [
    ...new Set(result.productRows.map((r) => r.branchAlias)),
  ];
  const aliasToBranchId = new Map<string, number>();
  for (const alias of uniqueAliases) {
    const resolved = await resolveBranchWithAI(alias, AliasSource.SALES);
    aliasToBranchId.set(alias, resolved.branchId);
    if (resolved.aiUsed) {
      aiCorrections.push(
        `Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`
      );
    }
  }

  // 2. UploadedFile yozuvi
  const fileRecord = await prisma.uploadedFile.create({
    data: {
      label: parsed.label,
      originalName: file.name,
      fileHash: hash,
      fileType: FileType.SALES,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      templateVersion: "v3",
      rowCount: result.productRows.length,
      status: UploadStatus.SUCCESS,
      uploadedById: Number(user.id),
    },
  });

  // Master farqlari hisoboti (try ichida to'ldiriladi, keyin ishlatiladi)
  let newSkuCount = 0;
  let newSkuSample = "";
  let nameDiffCount = 0;

  try {
    // 3. Mahsulotlarni master bilan solishtirish.
    // MUHIM: master (iyerarxiya/sku.xlsx) ASOSIY — mavjud mahsulotning nomi/categoryId
    // QAYTA YOZILMAYDI. Faqat yangi kodlar qo'shiladi; nom farqlari HISOBOT qilinadi
    // (qaror — keyin interaktiv review'da yoki Iyerarxiya editor'da).
    const uniqueProducts = new Map<
      number,
      { code: number; name: string; categoryId: number | null }
    >();
    for (const row of result.productRows) {
      if (!uniqueProducts.has(row.productCode)) {
        const categoryId =
          row.parentCategoryCode != null
            ? (categoryCodeToId.get(row.parentCategoryCode) ?? null)
            : null;
        uniqueProducts.set(row.productCode, {
          code: row.productCode,
          name: row.productName,
          categoryId,
        });
      }
    }
    const fileProducts = [...uniqueProducts.values()];

    // Mavjud mahsulotlar (kod bo'yicha) — master holati
    const existingRows = await prisma.product.findMany({
      where: { code: { in: fileProducts.map((p) => p.code) } },
      select: { id: true, code: true, name: true },
    });
    const existingByCode = new Map(existingRows.map((p) => [p.code, p]));

    // Yangi (master'da yo'q) va nom-farqli (master saqlanadi) mahsulotlar.
    // Solishtirishda bo'shliqlar normallashtiriladi (ortiqcha/ketma-ket bo'shliq
    // farqi ahamiyatsiz — false "nom farqi" bermaslik uchun).
    const wsNorm = (s: string) => s.replace(/\s+/g, " ").trim();
    const newProducts = fileProducts.filter((p) => !existingByCode.has(p.code));
    const nameChanges = fileProducts.filter((p) => {
      const e = existingByCode.get(p.code);
      return e && wsNorm(e.name) !== wsNorm(p.name);
    });
    // Hisobot uchun (try'dan tashqarida ishlatiladi)
    newSkuCount = newProducts.length;
    newSkuSample = newProducts.slice(0, 5).map((p) => p.code).join(", ");
    nameDiffCount = nameChanges.length;

    // FAQAT yangi mahsulotlar qo'shiladi (mavjud master tegilmaydi).
    // Yangi SKU categoryId = NULL → "Moslanmagan" ro'yxatiga tushadi, admin keyin
    // to'g'ri subkategoriyani tayinlaydi (sotuv faylidagi taxminga ishonmaymiz).
    const BATCH = 500;
    for (let i = 0; i < newProducts.length; i += BATCH) {
      const chunk = newProducts.slice(i, i + BATCH);
      // updatedAt — @updatedAt DB default'siz (Prisma klient to'ldiradi); xom SQL'da
      // qo'lda now() beramiz, aks holda NOT NULL buzilishi (23502).
      const vals = chunk.map((p) =>
        Prisma.sql`(${p.code}, ${p.name}, ${null}, now(), now())`
      );
      await prisma.$executeRaw`
        INSERT INTO "Product" ("code", "name", "categoryId", "createdAt", "updatedAt")
        VALUES ${Prisma.join(vals)}
        ON CONFLICT ("code") DO NOTHING
      `;
    }

    // 3b. Nom farqlari → ProductNameMismatch (review uchun). Mos kelganlar tozalanadi.
    const mismatchData = nameChanges.map((p) => ({
      productId: existingByCode.get(p.code)!.id,
      fileName: p.name,
      uploadedFileId: fileRecord.id,
    }));
    const matchedPids = fileProducts
      .filter((p) => { const e = existingByCode.get(p.code); return !!e && wsNorm(e.name) === wsNorm(p.name); })
      .map((p) => existingByCode.get(p.code)!.id);
    const touchedPids = [...mismatchData.map((m) => m.productId), ...matchedPids];
    if (touchedPids.length > 0) {
      await prisma.productNameMismatch.deleteMany({ where: { productId: { in: touchedPids } } });
    }
    if (mismatchData.length > 0) {
      await prisma.productNameMismatch.createMany({ data: mismatchData });
    }

    // 4. Product code → DB id mapping (mavjud + yangi)
    const dbProducts = await prisma.product.findMany({
      where: { code: { in: fileProducts.map((p) => p.code) } },
      select: { id: true, code: true },
    });
    const productCodeToId = new Map<number, number>(
      dbProducts.map((p) => [p.code, p.id])
    );

    // 5. ProductSales upsert — bulk, 500 ta lik batch
    for (let i = 0; i < result.productRows.length; i += BATCH) {
      const chunk = result.productRows.slice(i, i + BATCH);
      const vals = chunk.flatMap((row) => {
        const productId = productCodeToId.get(row.productCode);
        const branchId = aliasToBranchId.get(row.branchAlias);
        if (!productId || !branchId) return [];
        const stockQty =
          row.stockQty != null ? new Prisma.Decimal(row.stockQty) : null;
        const soldQty =
          row.soldQty != null ? new Prisma.Decimal(row.soldQty) : null;
        const costAmount =
          row.costAmount != null ? new Prisma.Decimal(row.costAmount) : null;
        return [
          Prisma.sql`(${fileRecord.id}, ${productId}, ${branchId}, ${result.periodStart}::date, ${result.periodEnd}::date, ${stockQty}, ${soldQty}, ${new Prisma.Decimal(row.amount)}, ${costAmount})`,
        ];
      });
      if (vals.length === 0) continue;
      await prisma.$executeRaw`
        INSERT INTO "ProductSales"
          ("uploadedFileId", "productId", "branchId", "periodStart", "periodEnd",
           "stockQty", "soldQty", "amount", "costAmount")
        VALUES ${Prisma.join(vals)}
        ON CONFLICT ("productId", "branchId", "periodStart", "periodEnd") DO UPDATE SET
          "uploadedFileId" = EXCLUDED."uploadedFileId",
          "stockQty"       = EXCLUDED."stockQty",
          "soldQty"        = EXCLUDED."soldQty",
          "amount"         = EXCLUDED."amount",
          "costAmount"     = EXCLUDED."costAmount"
      `;
    }

    // 6. CategorySales DERIVE: ProductSales dan SUM qilib CategorySales ga upsert
    // Faqat shu fayl/davr uchun tegishli kategoriyalar bo'yicha
    await deriveCategorySalesFromProducts(
      fileRecord.id,
      result.periodStart,
      result.periodEnd,
      aliasToBranchId
    );
  } catch (err) {
    await prisma.uploadedFile.delete({ where: { id: fileRecord.id } }).catch(() => null);
    throw err;
  }

  revalidatePath("/admin/files");
  revalidatePath("/dashboard");
  revalidateTag(ANALYTICS_CACHE_TAG, "max");

  const uniqueProdCount = new Set(result.productRows.map((r) => r.productCode)).size;

  // Master bilan farqlar — hisobot (master O'ZGARTIRILMADI)
  const review: string[] = [];
  if (newSkuCount > 0) {
    review.push(`🆕 Yangi SKU: ${newSkuCount} ta — kategoriyasiz qo'shildi (Moslanmagan ro'yxatida subkategoriya tayinlang). Kodlar: ${newSkuSample}${newSkuCount > 5 ? "…" : ""}`);
  }
  if (nameDiffCount > 0) {
    review.push(`✏️ Nom farqi: ${nameDiffCount} ta — master saqlandi. Moslanmagan → "Nom farqi" tabида ko'rib chiqing.`);
  }

  return {
    ok: true,
    fileId: fileRecord.id,
    aiCorrections: review.length > 0 ? [...aiCorrections, ...review] : (aiCorrections.length > 0 ? aiCorrections : undefined),
    summary: `Saqlandi (v3): ${uniqueProdCount} mahsulot × ${uniqueAliases.length} filial = ${result.productRows.length} qator, period ${result.periodStart.toISOString().slice(0, 10)} → ${result.periodEnd.toISOString().slice(0, 10)}. Master tegilmadi${newSkuCount ? `, ${newSkuCount} yangi SKU` : ""}${nameDiffCount ? `, ${nameDiffCount} nom farqi` : ""}.`,
  };
}

/**
 * ProductSales dan CategorySales ni derive qiladi.
 * Shu davr va filiallar uchun har Category.id bo'yicha SUM(amount), SUM(costAmount) hisoblab,
 * CategorySales ga upsert qiladi.
 *
 * Bu mavjud dashboard'larning CategorySales dan ishlaydigan grafiklari uchun zarur.
 */
async function deriveCategorySalesFromProducts(
  fileId: number,
  periodStart: Date,
  periodEnd: Date,
  aliasToBranchId: Map<string, number>
): Promise<void> {
  const branchIds = [...aliasToBranchId.values()];
  if (branchIds.length === 0) return;

  // PostgreSQL'dan to'g'ridan-to'g'ri aggregate qilamiz — N+1 yo'q
  // Product.categoryId orqali guruhlash
  const aggregated = await prisma.$queryRaw<
    Array<{
      branchId: number;
      categoryId: number;
      totalAmount: string;
      totalCost: string | null;
    }>
  >`
    SELECT
      ps."branchId",
      p."categoryId",
      SUM(ps."amount")::text      AS "totalAmount",
      SUM(ps."costAmount")::text  AS "totalCost"
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    WHERE
      ps."periodStart" = ${periodStart}::date
      AND ps."periodEnd"  = ${periodEnd}::date
      AND ps."branchId"   = ANY(${branchIds}::int[])
      AND p."categoryId"  IS NOT NULL
    GROUP BY ps."branchId", p."categoryId"
  `;

  if (aggregated.length === 0) return;

  const BATCH = 500;
  for (let i = 0; i < aggregated.length; i += BATCH) {
    const chunk = aggregated.slice(i, i + BATCH);
    const vals = chunk.map((row) => {
      const cost = row.totalCost != null ? new Prisma.Decimal(row.totalCost) : null;
      return Prisma.sql`(${fileId}, ${row.branchId}, ${row.categoryId}, ${periodStart}::date, ${periodEnd}::date, ${new Prisma.Decimal(row.totalAmount)}, ${cost})`;
    });
    await prisma.$executeRaw`
      INSERT INTO "CategorySales"
        ("uploadedFileId", "branchId", "categoryId", "periodStart", "periodEnd", "amount", "costAmount")
      VALUES ${Prisma.join(vals)}
      ON CONFLICT ("branchId", "categoryId", "periodStart", "periodEnd") DO UPDATE SET
        "uploadedFileId" = EXCLUDED."uploadedFileId",
        "amount"         = EXCLUDED."amount",
        "costAmount"     = EXCLUDED."costAmount"
    `;
  }
}

// ============ METRICS ============

const metricsInputSchema = z.object({
  label: labelSchema,
  branchId: z.coerce.number().int().positive(),
});

export async function uploadMetricsAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdminUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    const parsed = metricsInputSchema.parse({
      label: formData.get("label"),
      branchId: formData.get("branchId"),
    });

    const branch = await prisma.branch.findUnique({ where: { id: parsed.branchId } });
    if (!branch) return { ok: false, error: "Filial topilmadi." };

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const result = parseMetricsWorkbook(buf);

    const fileRecord = await prisma.uploadedFile.create({
      data: {
        label: parsed.label,
        originalName: file.name,
        fileHash: hash,
        fileType: FileType.METRICS,
        branchId: parsed.branchId,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        rowCount: result.metrics.length,
        status: UploadStatus.SUCCESS,
        uploadedById: Number(user.id),
      },
    });

    try {
      const values = result.metrics.map((m) =>
        Prisma.sql`(${fileRecord.id}, ${parsed.branchId}, ${m.date}::date, ${m.receiptCount}, ${new Prisma.Decimal(m.receiptTotal)}, ${new Prisma.Decimal(m.avgItemsPerReceipt)}, ${new Prisma.Decimal(m.avgReceipt)}, ${new Prisma.Decimal(m.bigPurchaseLevel)}, ${new Prisma.Decimal(m.smallPurchaseLevel)})`
      );
      await prisma.$executeRaw`
        INSERT INTO "DailyMetrics" ("uploadedFileId", "branchId", "date", "receiptCount", "receiptTotal", "avgItemsPerReceipt", "avgReceipt", "bigPurchaseLevel", "smallPurchaseLevel")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("branchId", "date")
        DO UPDATE SET
          "uploadedFileId"       = EXCLUDED."uploadedFileId",
          "receiptCount"         = EXCLUDED."receiptCount",
          "receiptTotal"         = EXCLUDED."receiptTotal",
          "avgItemsPerReceipt"   = EXCLUDED."avgItemsPerReceipt",
          "avgReceipt"           = EXCLUDED."avgReceipt",
          "bigPurchaseLevel"     = EXCLUDED."bigPurchaseLevel",
          "smallPurchaseLevel"   = EXCLUDED."smallPurchaseLevel"
      `;
    } catch (err) {
      await prisma.uploadedFile.delete({ where: { id: fileRecord.id } }).catch(() => null);
      throw err;
    }

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");

    return {
      ok: true,
      fileId: fileRecord.id,
      summary: `Saqlandi: ${branch.name} uchun ${result.metrics.length} kunlik metrika.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Noma'lum xato." };
  }
}

// ============ VISITS ============

const visitsInputSchema = z.object({
  label: labelSchema,
  year: z.coerce.number().int().min(2000).max(2100),
});

export async function uploadVisitsAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdminUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    const parsed = visitsInputSchema.parse({
      label: formData.get("label"),
      year: formData.get("year"),
    });

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const result = parseVisitsWorkbook(buf, parsed.year);

    const uniqueAliases = [...new Set(result.rows.map((r) => r.branchAlias))];
    const aliasToBranchId = new Map<string, number>();
    const aiCorrections: string[] = [];
    for (const alias of uniqueAliases) {
      const resolved = await resolveBranchWithAI(alias, AliasSource.VISITS);
      aliasToBranchId.set(alias, resolved.branchId);
      if (resolved.aiUsed) {
        aiCorrections.push(`Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`);
      }
    }

    const dates = result.rows.map((r) => r.date.getTime());
    const periodStart = new Date(Math.min(...dates));
    const periodEnd = new Date(Math.max(...dates));

    const fileRecord = await prisma.uploadedFile.create({
      data: {
        label: parsed.label,
        originalName: file.name,
        fileHash: hash,
        fileType: FileType.VISITS,
        periodStart,
        periodEnd,
        yearOverride: parsed.year,
        rowCount: result.rows.length,
        status: UploadStatus.SUCCESS,
        uploadedById: Number(user.id),
      },
    });

    try {
      const values = result.rows.map((row) => {
        const branchId = aliasToBranchId.get(row.branchAlias)!;
        return Prisma.sql`(${fileRecord.id}, ${branchId}, ${row.date}::date, ${row.count})`;
      });
      await prisma.$executeRaw`
        INSERT INTO "DailyVisits" ("uploadedFileId", "branchId", "date", "visitCount")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("branchId", "date")
        DO UPDATE SET
          "uploadedFileId" = EXCLUDED."uploadedFileId",
          "visitCount"     = EXCLUDED."visitCount"
      `;
    } catch (err) {
      await prisma.uploadedFile.delete({ where: { id: fileRecord.id } }).catch(() => null);
      throw err;
    }

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");

    return {
      ok: true,
      fileId: fileRecord.id,
      aiCorrections: aiCorrections.length > 0 ? aiCorrections : undefined,
      summary: `Saqlandi: ${result.rows.length} qator (${uniqueAliases.length} filial × kunlar).`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Noma'lum xato." };
  }
}

// ============ DAILY PLANS ============

const dailyPlansInputSchema = z.object({
  label: labelSchema,
});

export async function uploadDailyPlansAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdminUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    const parsed = dailyPlansInputSchema.parse({
      label: formData.get("label"),
    });

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const cats = await getCategoryMap();
    const catNames = [...cats.keys()];
    const catAliasMap = await getCategoryAliasNameMap();
    const aiCorrections: string[] = [];

    // Birinchi parse — kategoriya alias jadvalidagi mosliklar bilan
    let result = parseDailyPlansWorkbook(buf, catNames, catAliasMap.size > 0 ? catAliasMap : undefined);

    // AI fallback — noma'lum kategoriyalar uchun
    if (result.skippedCategories.length > 0 && process.env.DEEPSEEK_API_KEY) {
      const aiMapping = await matchCategoryNames(
        result.skippedCategories,
        catNames
      ).catch(() => new Map<string, string>());

      if (aiMapping.size > 0) {
        // AI topganlarini CategoryAlias jadvaliga saqlash
        for (const [alias, dbName] of aiMapping) {
          const dbId = cats.get(dbName);
          if (dbId) {
            await prisma.categoryAlias.create({ data: { alias, categoryId: dbId } }).catch(() => null);
            aiCorrections.push(`Kategoriya: "${alias}" → "${dbName}" (AI, alias saqlandi)`);
          }
        }
        // Qayta parse
        const merged = new Map([...catAliasMap, ...aiMapping]);
        result = parseDailyPlansWorkbook(buf, catNames, merged);
      }
    }

    if (result.skippedCategories.length > 0) {
      return {
        ok: false,
        error: `Quyidagi kategoriyalar bazada topilmadi va aliasi yo'q: ${result.skippedCategories.join(", ")}. Kategoriyalar bo'limidan alias qo'shing.`,
      };
    }

    // Filial aliaslarini yechish (sheet nomi → branchId)
    const uniqueBranchAliases = [...new Set(result.rows.map((r) => r.branchAlias))];
    const branchIdByAlias = new Map<string, number>();
    for (const alias of uniqueBranchAliases) {
      const resolved = await resolveBranchWithAI(alias, AliasSource.PLANS);
      branchIdByAlias.set(alias, resolved.branchId);
      if (resolved.aiUsed) {
        aiCorrections.push(
          `Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`
        );
      }
    }

    // Mavjud yozuvlar tekshiruvi — agar shu davrda DailyPlan yozuvi bo'lsa, qabul qilmaslik
    const existing = await prisma.dailyPlan.findFirst({
      where: {
        branchId: { in: [...branchIdByAlias.values()] },
        date: { gte: result.periodStart, lte: result.periodEnd },
      },
      select: { branchId: true, date: true },
    });
    if (existing) {
      const branch = await prisma.branch.findUnique({ where: { id: existing.branchId }, select: { name: true } });
      return {
        ok: false,
        error: `Bu davr uchun reja allaqachon yuklangan ("${branch?.name ?? "?"}", ${existing.date.toISOString().slice(0, 10)}). Yangi reja yuklash uchun avval eski yozuvlarni o'chiring.`,
      };
    }

    const fileRecord = await prisma.uploadedFile.create({
      data: {
        label: parsed.label,
        originalName: file.name,
        fileHash: hash,
        fileType: FileType.DAILY_PLANS,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        rowCount: result.rows.length,
        status: UploadStatus.SUCCESS,
        uploadedById: Number(user.id),
      },
    });

    try {
      const values = result.rows.map((row) => {
        const branchId = branchIdByAlias.get(row.branchAlias)!;
        const categoryId = cats.get(row.categoryAlias)!;
        return Prisma.sql`(${fileRecord.id}, ${branchId}, ${categoryId}, ${row.date}::date, ${new Prisma.Decimal(row.planAmount)})`;
      });
      await prisma.$executeRaw`
        INSERT INTO "DailyPlan" ("uploadedFileId", "branchId", "categoryId", "date", "planAmount")
        VALUES ${Prisma.join(values)}
      `;
    } catch (err) {
      await prisma.uploadedFile.delete({ where: { id: fileRecord.id } }).catch(() => null);
      throw err;
    }

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidatePath("/report");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");

    return {
      ok: true,
      fileId: fileRecord.id,
      aiCorrections: aiCorrections.length > 0 ? aiCorrections : undefined,
      summary: `Saqlandi: ${result.rows.length} kunlik reja (${uniqueBranchAliases.length} filial), ${result.periodStart.toISOString().slice(0, 10)} → ${result.periodEnd.toISOString().slice(0, 10)}.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Noma'lum xato." };
  }
}
