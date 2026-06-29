"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminTier, isSystemAdmin } from "@/lib/roles";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

export type ReceiptMetricCell = { receiptCount: number; itemsPerReceipt: number };

async function requireViewer() {
  const session = await auth();
  if (!session?.user || !isAdminTier(session.user.roles)) throw new Error("Ruxsat yo'q");
  return session.user;
}
async function requireEditor() {
  const session = await auth();
  if (!session?.user || !isSystemAdmin(session.user.roles)) throw new Error("Ruxsat yo'q");
  return session.user;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Tanlangan oy uchun filial × kun bo'yicha kunlik sotuv (CategorySales, SKU-derive). */
export async function getMonthlySalesByBranch(
  year: number,
  month: number
): Promise<Record<string, number>> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const rows = await prisma.$queryRaw<{ branchId: number; d: string; sales: number }[]>`
    SELECT "branchId", "periodStart"::text AS d, SUM("amount")::float8 AS sales
    FROM "CategorySales"
    WHERE "periodStart" >= ${start}::date AND "periodStart" <= ${end}::date
    GROUP BY "branchId", "periodStart"
  `;
  const out: Record<string, number> = {};
  for (const r of rows) out[`${r.branchId}_${r.d.slice(0, 10)}`] = Number(r.sales);
  return out;
}

/** Tanlangan oy uchun barcha filial × kun metrikalari + kunlik sotuv. Kalit: `${branchId}_${YYYY-MM-DD}`. */
export async function getReceiptMetricsAction(
  year: number,
  month: number
): Promise<
  | { ok: true; data: Record<string, ReceiptMetricCell>; sales: Record<string, number> }
  | { ok: false; error: string }
> {
  try {
    await requireViewer();
    const y = z.coerce.number().int().min(2000).max(2100).parse(year);
    const m = z.coerce.number().int().min(1).max(12).parse(month);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0)); // oy oxiri
    const [rows, sales] = await Promise.all([
      prisma.dailyReceiptMetric.findMany({
        where: { date: { gte: start, lte: end } },
        select: { branchId: true, date: true, receiptCount: true, itemsPerReceipt: true },
      }),
      getMonthlySalesByBranch(y, m),
    ]);
    const data: Record<string, ReceiptMetricCell> = {};
    for (const r of rows) {
      data[`${r.branchId}_${isoDay(r.date)}`] = {
        receiptCount: r.receiptCount,
        itemsPerReceipt: Number(r.itemsPerReceipt),
      };
    }
    return { ok: true, data, sales };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}

const upsertSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri"),
  receiptCount: z.coerce.number().int().min(0).max(1_000_000),
  itemsPerReceipt: z.coerce.number().int().min(0).max(1_000_000), // chekdagi tovar soni — butun son
});

/** Bitta katak (filial × kun) ni saqlaydi. receiptCount=0 va items=0 bo'lsa yozuv o'chiriladi. */
export async function upsertReceiptMetricAction(
  input: z.input<typeof upsertSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireEditor();
    const p = upsertSchema.parse(input);
    const date = new Date(p.date + "T00:00:00.000Z");

    if (p.receiptCount === 0 && p.itemsPerReceipt === 0) {
      await prisma.dailyReceiptMetric.deleteMany({ where: { branchId: p.branchId, date } });
      // Chek metrikalari dashboard keshlarida (receiptSeries, kpiByBranch) ishlatiladi
      revalidateTag(ANALYTICS_CACHE_TAG, "max");
      return { ok: true };
    }
    await prisma.dailyReceiptMetric.upsert({
      where: { branchId_date: { branchId: p.branchId, date } },
      create: {
        branchId: p.branchId,
        date,
        receiptCount: p.receiptCount,
        itemsPerReceipt: p.itemsPerReceipt,
        createdById: Number(user.id),
      },
      update: { receiptCount: p.receiptCount, itemsPerReceipt: p.itemsPerReceipt },
    });
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}
