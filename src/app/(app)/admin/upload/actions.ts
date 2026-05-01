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

export type UploadResult =
  | { ok: true; fileId: number; summary: string }
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

async function resolveBranch(alias: string, source: AliasSource): Promise<number> {
  const a = await prisma.branchAlias.findUnique({
    where: { alias_source: { alias, source } },
    select: { branchId: true },
  });
  if (!a) {
    throw new Error(
      `Filial nomi tanilmadi: "${alias}" (${source}). Filiallar bo'limidan alias qo'shing.`
    );
  }
  return a.branchId;
}

async function getCategoryMap(): Promise<Map<string, number>> {
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
    const result = parseSalesWorkbook(buf, [...cats.keys()]);

    // Filial aliaslarini yechish
    const uniqueAliases = [...new Set(result.rows.map((r) => r.branchAlias))];
    const aliasToBranchId = new Map<string, number>();
    for (const alias of uniqueAliases) {
      aliasToBranchId.set(alias, await resolveBranch(alias, AliasSource.SALES));
    }

    const fileRecord = await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
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

      for (const row of result.rows) {
        const branchId = aliasToBranchId.get(row.branchAlias)!;
        const categoryId = cats.get(row.categoryName)!;
        await tx.categorySales.upsert({
          where: {
            branchId_categoryId_periodStart_periodEnd: {
              branchId,
              categoryId,
              periodStart: result.periodStart,
              periodEnd: result.periodEnd,
            },
          },
          create: {
            uploadedFileId: created.id,
            branchId,
            categoryId,
            periodStart: result.periodStart,
            periodEnd: result.periodEnd,
            amount: new Prisma.Decimal(row.amount),
          },
          update: {
            uploadedFileId: created.id,
            amount: new Prisma.Decimal(row.amount),
          },
        });
      }

      return created;
    });

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");

    const branchCount = uniqueAliases.length;
    return {
      ok: true,
      fileId: fileRecord.id,
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

    const fileRecord = await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
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

      for (const m of result.metrics) {
        await tx.dailyMetrics.upsert({
          where: { branchId_date: { branchId: parsed.branchId, date: m.date } },
          create: {
            uploadedFileId: created.id,
            branchId: parsed.branchId,
            date: m.date,
            receiptCount: m.receiptCount,
            receiptTotal: new Prisma.Decimal(m.receiptTotal),
            avgItemsPerReceipt: new Prisma.Decimal(m.avgItemsPerReceipt),
            avgReceipt: new Prisma.Decimal(m.avgReceipt),
            bigPurchaseLevel: new Prisma.Decimal(m.bigPurchaseLevel),
            smallPurchaseLevel: new Prisma.Decimal(m.smallPurchaseLevel),
          },
          update: {
            uploadedFileId: created.id,
            receiptCount: m.receiptCount,
            receiptTotal: new Prisma.Decimal(m.receiptTotal),
            avgItemsPerReceipt: new Prisma.Decimal(m.avgItemsPerReceipt),
            avgReceipt: new Prisma.Decimal(m.avgReceipt),
            bigPurchaseLevel: new Prisma.Decimal(m.bigPurchaseLevel),
            smallPurchaseLevel: new Prisma.Decimal(m.smallPurchaseLevel),
          },
        });
      }

      return created;
    });

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
    for (const alias of uniqueAliases) {
      aliasToBranchId.set(alias, await resolveBranch(alias, AliasSource.VISITS));
    }

    const dates = result.rows.map((r) => r.date.getTime());
    const periodStart = new Date(Math.min(...dates));
    const periodEnd = new Date(Math.max(...dates));

    const fileRecord = await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
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

      for (const row of result.rows) {
        const branchId = aliasToBranchId.get(row.branchAlias)!;
        await tx.dailyVisits.upsert({
          where: { branchId_date: { branchId, date: row.date } },
          create: {
            uploadedFileId: created.id,
            branchId,
            date: row.date,
            visitCount: row.count,
          },
          update: {
            uploadedFileId: created.id,
            visitCount: row.count,
          },
        });
      }

      return created;
    });

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");

    return {
      ok: true,
      fileId: fileRecord.id,
      summary: `Saqlandi: ${result.rows.length} qator (${uniqueAliases.length} filial × kunlar).`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Noma'lum xato." };
  }
}
