"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { FileType, AliasSource, UploadStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { sha256 } from "@/lib/parsers/utils";
import { parseSalesWorkbook } from "@/lib/parsers/sales";
import { parseMetricsWorkbook } from "@/lib/parsers/metrics";
import { parseVisitsWorkbook } from "@/lib/parsers/visits";
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

const OTHERS_CATEGORY = "BOSHQALAR";

async function getCategoryMap(): Promise<Map<string, number>> {
  // "BOSHQALAR" kategoriyasi yo'q bo'lsa avtomatik yaratamiz (sortOrder=0)
  await prisma.category.upsert({
    where:  { name: OTHERS_CATEGORY },
    update: {},
    create: { name: OTHERS_CATEGORY, sortOrder: 0 },
  });
  const cats = await prisma.category.findMany({ select: { id: true, name: true } });
  return new Map(cats.map((c) => [c.name, c.id]));
}

// ============ SALES ============

const salesInputSchema = z.object({
  label: labelSchema,
});

export async function uploadSalesAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    const parsed = salesInputSchema.parse({
      label: formData.get("label"),
    });

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const cats = await getCategoryMap();
    const catNames = [...cats.keys()];
    const aiCorrections: string[] = [];

    // 1. Birinchi parse — aniq mosliklar bilan
    let result = parseSalesWorkbook(buf, catNames);

    // 2. AI: noma'lum kategoriyalarni moslashtirish
    if (result.skippedCategories.length > 0 && process.env.DEEPSEEK_API_KEY) {
      const categoryMapping = await matchCategoryNames(
        result.skippedCategories,
        catNames
      ).catch(() => new Map<string, string>());

      if (categoryMapping.size > 0) {
        // Qayta parse — AI moslik bilan
        result = parseSalesWorkbook(buf, catNames, categoryMapping);
        for (const [excel, db] of categoryMapping) {
          aiCorrections.push(`Kategoriya: "${excel}" → "${db}"`);
        }
      }
    }

    // 3. Filial aliaslarini yechish (AI fallback bilan)
    const uniqueAliases = [...new Set(result.rows.map((r) => r.branchAlias))];
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
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        rowCount: result.rows.length,
        status: UploadStatus.SUCCESS,
        uploadedById: Number(user.id),
      },
    });

    try {
      const values = result.rows.map((row) => {
        const branchId = aliasToBranchId.get(row.branchAlias)!;
        const categoryId = cats.get(row.categoryName)!;
        const cost = row.costAmount != null ? new Prisma.Decimal(row.costAmount) : null;
        return Prisma.sql`(${fileRecord.id}, ${branchId}, ${categoryId}, ${result.periodStart}::date, ${result.periodEnd}::date, ${new Prisma.Decimal(row.amount)}, ${cost})`;
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
      summary: `Saqlandi: ${result.rows.length} qator (${branchCount} filial), period ${result.periodStart.toISOString().slice(0, 10)} → ${result.periodEnd.toISOString().slice(0, 10)}.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Noma'lum xato." };
  }
}

// ============ METRICS ============

const metricsInputSchema = z.object({
  label: labelSchema,
  branchId: z.coerce.number().int().positive(),
});

export async function uploadMetricsAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdmin();
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
    const user = await requireAdmin();
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
