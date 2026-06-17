"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { canSeeSuppliers, canEditSuppliers, canManageWarehouse } from "@/lib/roles";
import { actionError } from "@/lib/action-error";
import { warehouseStockList, parseWarehouseRows, type WarehouseRow } from "@/lib/warehouse";
import { branchDistributionSuggest, type DistSuggest } from "@/lib/distribution";

async function requireView() {
  const s = await auth();
  if (!s?.user || !canSeeSuppliers(s.user.role)) throw new Error("Ruxsat yo'q");
  return s.user;
}
async function requireEdit() {
  const s = await auth();
  if (!s?.user || !canEditSuppliers(s.user.role)) throw new Error("Ruxsat yo'q");
  return s.user;
}

/** Ombor qoldig'i ro'yxati — qidiruv + pagination (lazy). */
export async function warehouseStockAction(
  input: { q?: string; page?: number }
): Promise<{ ok: true; rows: WarehouseRow[]; total: number; pageSize: number } | { ok: false; error: string }> {
  try {
    await requireView();
    const res = await warehouseStockList({ q: input.q, page: input.page });
    return { ok: true, ...res };
  } catch (err) {
    return actionError(err, "warehouseStock");
  }
}

const adjustSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().min(0).max(1_000_000_000_000),
});

/** Bitta SKU ombor qoldig'ini qo'lda o'rnatish (absolyut qiymat). */
export async function adjustWarehouseStockAction(
  input: z.input<typeof adjustSchema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireEdit();
    const p = adjustSchema.parse(input);
    await prisma.warehouseStock.upsert({
      where: { productId: p.productId },
      create: { productId: p.productId, qty: p.qty },
      update: { qty: p.qty },
    });
    revalidatePath("/logistika");
    return { ok: true };
  } catch (err) {
    return actionError(err, "adjustWarehouseStock");
  }
}

/** Ombor qoldig'ini fayl (kod + qoldiq) orqali import qilish — kod bo'yicha upsert (snapshot). */
export async function importWarehouseStockAction(
  formData: FormData
): Promise<{ ok: true; matched: number; unmatched: number; unmatchedSample: number[]; rows: number } | { ok: false; error: string }> {
  try {
    await requireEdit();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Fayl topilmadi." };
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { ok: false, error: "Bo'sh fayl." };
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
    const parsed = parseWarehouseRows(aoa);
    if (parsed.length === 0) return { ok: false, error: "Faylda kod/qoldiq qatorlari topilmadi (ustunlar: kod, qoldiq)." };

    // Bir kod ikki marta bo'lsa — oxirgi qiymat
    const byCode = new Map<number, number>();
    for (const r of parsed) byCode.set(r.code, r.qty);
    const codes = [...byCode.keys()];

    const prods = await prisma.product.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const idByCode = new Map(prods.map((p) => [p.code, p.id]));
    const matchedRows: { pid: number; qty: number }[] = [];
    const unmatched: number[] = [];
    for (const [code, qty] of byCode) {
      const pid = idByCode.get(code);
      if (pid != null) matchedRows.push({ pid, qty });
      else unmatched.push(code);
    }

    const BATCH = 500;
    for (let i = 0; i < matchedRows.length; i += BATCH) {
      const chunk = matchedRows.slice(i, i + BATCH);
      const vals = chunk.map((r) => Prisma.sql`(${r.pid}, ${new Prisma.Decimal(r.qty)}, now())`);
      await prisma.$executeRaw`
        INSERT INTO "WarehouseStock" ("productId", "qty", "updatedAt") VALUES ${Prisma.join(vals)}
        ON CONFLICT ("productId") DO UPDATE SET "qty" = EXCLUDED."qty", "updatedAt" = now()
      `;
    }
    revalidatePath("/logistika");
    return { ok: true, matched: matchedRows.length, unmatched: unmatched.length, unmatchedSample: unmatched.slice(0, 10), rows: parsed.length };
  } catch (err) {
    return actionError(err, "importWarehouseStock");
  }
}

// ─── Taqsimot (ombor → filial) ──────────────────────────────────────────────

async function requireWarehouse() {
  const s = await auth();
  if (!s?.user || !canManageWarehouse(s.user.role)) throw new Error("Ruxsat yo'q");
  return s.user;
}

/** Filial uchun taqsimot tavsiyasi (ombor + filial qoldiq/sotuv asosida). */
export async function distributionSuggestAction(
  branchId: number, targetDays: number
): Promise<{ ok: true; items: DistSuggest[] } | { ok: false; error: string }> {
  try {
    await requireWarehouse();
    const bid = z.coerce.number().int().positive().parse(branchId);
    const td = z.coerce.number().int().min(1).max(60).parse(targetDays);
    return { ok: true, items: await branchDistributionSuggest(bid, td) };
  } catch (err) {
    return actionError(err, "distributionSuggest");
  }
}

const distItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().positive().max(1_000_000),
});

/** Yangi taqsimot (qoralama) yaratadi. */
export async function createDistributionAction(input: {
  branchId: number; targetDays: number; note?: string; items: { productId: number; qty: number }[];
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const user = await requireWarehouse();
    const branchId = z.coerce.number().int().positive().parse(input.branchId);
    const targetDays = z.coerce.number().int().min(1).max(60).parse(input.targetDays);
    const items = z.array(distItemSchema).min(1, "Kamida bitta SKU kerak").parse(input.items);
    const d = await prisma.distribution.create({
      data: {
        branchId, targetDays, note: input.note?.trim() || null, createdById: Number(user.id), status: "DRAFT",
        items: { create: items.map((i) => ({ productId: i.productId, qty: i.qty })) },
      },
      select: { id: true },
    });
    revalidatePath("/logistika");
    return { ok: true, id: d.id };
  } catch (err) {
    return actionError(err, "createDistribution");
  }
}

/** Taqsimot qatorlarini yangilash (faqat qoralama). */
export async function updateDistributionItemsAction(
  id: number, items: { productId: number; qty: number }[], note?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireWarehouse();
    const did = z.coerce.number().int().positive().parse(id);
    const parsed = z.array(distItemSchema).min(1, "Kamida bitta SKU kerak").parse(items);
    const d = await prisma.distribution.findUnique({ where: { id: did }, select: { status: true } });
    if (!d) return { ok: false, error: "Taqsimot topilmadi." };
    if (d.status !== "DRAFT") return { ok: false, error: "Faqat qoralama tahrirlanadi." };
    await prisma.$transaction([
      prisma.distributionItem.deleteMany({ where: { distributionId: did } }),
      prisma.distributionItem.createMany({ data: parsed.map((i) => ({ distributionId: did, productId: i.productId, qty: i.qty })) }),
      prisma.distribution.update({ where: { id: did }, data: { note: note?.trim() || null } }),
    ]);
    revalidatePath(`/logistika/taqsimot/${did}`);
    revalidatePath("/logistika");
    return { ok: true };
  } catch (err) {
    return actionError(err, "updateDistributionItems");
  }
}

/** Tasdiqlash (qoralama → tasdiqlandi): ombor qoldig'idan ayiriladi (0 dan past tushmaydi). */
export async function confirmDistributionAction(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireWarehouse();
    const did = z.coerce.number().int().positive().parse(id);
    const d = await prisma.distribution.findUnique({
      where: { id: did },
      select: { status: true, items: { select: { productId: true, qty: true } } },
    });
    if (!d) return { ok: false, error: "Taqsimot topilmadi." };
    if (d.status !== "DRAFT") return { ok: false, error: "Faqat qoralamani tasdiqlash mumkin." };
    if (d.items.length === 0) return { ok: false, error: "Bo'sh taqsimot." };
    const ops: Prisma.PrismaPromise<unknown>[] = d.items.map((it) =>
      prisma.$executeRaw`UPDATE "WarehouseStock" SET "qty" = GREATEST("qty" - ${new Prisma.Decimal(it.qty)}::numeric, 0), "updatedAt" = now() WHERE "productId" = ${it.productId}`
    );
    ops.push(prisma.distribution.update({ where: { id: did }, data: { status: "CONFIRMED", confirmedAt: new Date() } }));
    await prisma.$transaction(ops);
    revalidatePath(`/logistika/taqsimot/${did}`);
    revalidatePath("/logistika");
    return { ok: true };
  } catch (err) {
    return actionError(err, "confirmDistribution");
  }
}

/** Qoralama taqsimotni o'chirish. */
export async function deleteDistributionAction(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireWarehouse();
    const did = z.coerce.number().int().positive().parse(id);
    const d = await prisma.distribution.findUnique({ where: { id: did }, select: { status: true } });
    if (!d) return { ok: false, error: "Taqsimot topilmadi." };
    if (d.status !== "DRAFT") return { ok: false, error: "Faqat qoralama o'chiriladi." };
    await prisma.distribution.delete({ where: { id: did } });
    revalidatePath("/logistika");
    return { ok: true };
  } catch (err) {
    return actionError(err, "deleteDistribution");
  }
}
