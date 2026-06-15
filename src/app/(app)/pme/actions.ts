"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canSeePme, canEditPme } from "@/lib/roles";
import { actionError } from "@/lib/action-error";
import { scopeParentIds, scopeProductWhere } from "@/lib/scope";
import type { Segment } from "@/generated/prisma/enums";

// Ko'rish — admin darajasi + supplychain + menejerlar; tahrir — read-only ADMIN'siz.
async function requirePmeViewer() {
  const session = await auth();
  if (!session?.user || !canSeePme(session.user.role)) throw new Error("Ruxsat yo'q");
  return session.user;
}
async function requirePmeEditor() {
  const session = await auth();
  if (!session?.user || !canEditPme(session.user.role)) throw new Error("Ruxsat yo'q");
  return session.user;
}

type ScopeUser = { id: string | number; role: string };

/** Mahsulotlar foydalanuvchi qamrovida ekanini tekshiradi (CAT_MANAGER scope IDOR). */
async function inScope(user: ScopeUser, productIds: number[]): Promise<boolean> {
  const scope = await scopeParentIds(Number(user.id), user.role);
  if (scope === null) return true; // admin/supplychain/boshi — barchasi
  const uniq = [...new Set(productIds)];
  if (uniq.length === 0) return true;
  const cnt = await prisma.product.count({ where: { id: { in: uniq }, ...scopeProductWhere(scope) } });
  return cnt === uniq.length;
}

export type SupplierLite = { id: number; name: string; total: number; assigned: number };

export type PmeSku = {
  productId: number; code: number; name: string; segment: Segment | null;
  arxiv: boolean; supplierName: string | null;
  // Iyerarxiya: guruh → kategoriya → subkategoriya (daraxt uchun)
  groupId: number | null; groupName: string | null; groupSort: number;
  catId: number | null; catName: string | null; catSort: number;
  subId: number | null; subName: string | null; subSort: number;
};

const CATEGORY_SELECT = {
  id: true, name: true, sortOrder: true, parentId: true,
  group: { select: { id: true, name: true, sortOrder: true } },
  parent: { select: { id: true, name: true, sortOrder: true, group: { select: { id: true, name: true, sortOrder: true } } } },
} as const;

type CatNode = {
  id: number; name: string; sortOrder: number; parentId: number | null;
  group: { id: number; name: string; sortOrder: number } | null;
  parent: { id: number; name: string; sortOrder: number; group: { id: number; name: string; sortOrder: number } | null } | null;
} | null;

function toPmeSku(p: {
  id: number; code: number; name: string; segment: Segment | null; archivedAt: Date | null;
  supplier: { name: string } | null; category: CatNode;
}): PmeSku {
  const c = p.category;
  const isSub = !!(c?.parentId && c.parent);
  const g = c ? (c.group ?? c.parent?.group ?? null) : null;
  return {
    productId: p.id, code: p.code, name: p.name, segment: p.segment,
    arxiv: p.archivedAt != null, supplierName: p.supplier?.name ?? null,
    groupId: g?.id ?? null, groupName: g?.name ?? null, groupSort: g?.sortOrder ?? 0,
    catId: isSub ? c!.parent!.id : (c?.id ?? null),
    catName: isSub ? c!.parent!.name : (c?.name ?? null),
    catSort: isSub ? c!.parent!.sortOrder : (c?.sortOrder ?? 0),
    subId: isSub ? c!.id : null,
    subName: isSub ? c!.name : null,
    subSort: isSub ? c!.sortOrder : 0,
  };
}

/** Biriktirish tabi — qamrovdagi yetkazib beruvchilar (SKU soni bilan). */
export async function pmeSuppliersAction(): Promise<
  { ok: true; suppliers: SupplierLite[] } | { ok: false; error: string }
> {
  try {
    const user = await requirePmeViewer();
    const scope = await scopeParentIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, suppliers: [] };
    const baseWhere = { supplierId: { not: null }, ...scopeProductWhere(scope) };
    // Jami SKU va segment biriktirilgan SKU sonini supplier bo'yicha bir vaqtda olamiz
    const [totalG, assignedG] = await Promise.all([
      prisma.product.groupBy({ by: ["supplierId"], where: baseWhere, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["supplierId"], where: { ...baseWhere, segment: { not: null } }, _count: { _all: true } }),
    ]);
    const ids = totalG.map((g) => g.supplierId).filter((x): x is number => x != null);
    const sups = await prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameBy = new Map(sups.map((s) => [s.id, s.name]));
    const assignedBy = new Map(assignedG.filter((g) => g.supplierId != null).map((g) => [g.supplierId!, g._count._all]));
    const suppliers = totalG
      .filter((g) => g.supplierId != null)
      .map((g) => ({
        id: g.supplierId!,
        name: nameBy.get(g.supplierId!) ?? "—",
        total: g._count._all,
        assigned: assignedBy.get(g.supplierId!) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "uz"));
    return { ok: true, suppliers };
  } catch (err) {
    return actionError(err, "pmeSuppliers");
  }
}

/** Biriktirish tabi — yetkazib beruvchi × qamrov SKU'lari (segment bilan, daraxt uchun). */
export async function pmeSupplierSkusAction(
  supplierId: number
): Promise<{ ok: true; items: PmeSku[] } | { ok: false; error: string }> {
  try {
    const user = await requirePmeViewer();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    const scope = await scopeParentIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, items: [] };
    const products = await prisma.product.findMany({
      where: { supplierId: sid, ...scopeProductWhere(scope) },
      select: { id: true, code: true, name: true, segment: true, archivedAt: true, supplier: { select: { name: true } }, category: { select: CATEGORY_SELECT } },
      orderBy: { name: "asc" },
      take: 5000,
    });
    return { ok: true, items: products.map(toPmeSku) };
  } catch (err) {
    return actionError(err, "pmeSupplierSkus");
  }
}

/** Analyze tabi — qamrovdagi SEGMENT biriktirilgan SKU'lar (segment→iyerarxiya daraxti uchun). */
export async function pmeAnalyzeAction(): Promise<
  { ok: true; items: PmeSku[] } | { ok: false; error: string }
> {
  try {
    const user = await requirePmeViewer();
    const scope = await scopeParentIds(Number(user.id), user.role);
    if (scope !== null && scope.length === 0) return { ok: true, items: [] };
    const products = await prisma.product.findMany({
      where: { segment: { not: null }, ...scopeProductWhere(scope) },
      select: { id: true, code: true, name: true, segment: true, archivedAt: true, supplier: { select: { name: true } }, category: { select: CATEGORY_SELECT } },
      orderBy: { name: "asc" },
      take: 10000,
    });
    return { ok: true, items: products.map(toPmeSku) };
  } catch (err) {
    return actionError(err, "pmeAnalyze");
  }
}

const segSchema = z.enum(["PREMIUM", "MEDIUM", "EASY"]).nullable();
type Result = { ok: true } | { ok: false; error: string };

/** Bitta SKU segmentini biriktirish (null — bo'shatish). */
export async function setSkuSegmentAction(input: {
  productId: number; segment: Segment | null;
}): Promise<Result> {
  try {
    const user = await requirePmeEditor();
    const pid = z.coerce.number().int().positive().parse(input.productId);
    const seg = segSchema.parse(input.segment);
    if (!(await inScope(user, [pid]))) return { ok: false, error: "Qamrovingizdan tashqari SKU." };
    await prisma.product.update({ where: { id: pid }, data: { segment: seg } });
    revalidatePath("/pme");
    return { ok: true };
  } catch (err) {
    return actionError(err, "setSkuSegment");
  }
}

const bulkSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(), // leaf kategoriya (subkat yoki to'g'ridan kategoriya)
  segment: z.enum(["PREMIUM", "MEDIUM", "EASY"]).nullable(),
});

/** Bulk: yetkazib beruvchining bitta (sub)kategoriyasidagi barcha qamrov SKU'lariga segment. */
export async function bulkSetSegmentAction(
  input: z.input<typeof bulkSchema>
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const user = await requirePmeEditor();
    const p = bulkSchema.parse(input);
    const scope = await scopeParentIds(Number(user.id), user.role);
    const res = await prisma.product.updateMany({
      where: { supplierId: p.supplierId, categoryId: p.categoryId, ...scopeProductWhere(scope) },
      data: { segment: p.segment },
    });
    revalidatePath("/pme");
    return { ok: true, count: res.count };
  } catch (err) {
    return actionError(err, "bulkSetSegment");
  }
}
