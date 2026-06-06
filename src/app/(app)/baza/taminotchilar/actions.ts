"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";

export type SupSub = { subId: number; subName: string; catName: string | null; group: string | null; count: number };
export type SupSku = { code: number; name: string };

/** Ta'minotchi ostidagi subkategoriyalar (SKU soni bilan) — lazy. */
export async function supplierSubcatsAction(
  supplierId: number
): Promise<{ ok: true; subs: SupSub[] } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const id = z.coerce.number().int().positive().parse(supplierId);
    const grouped = await prisma.product.groupBy({
      by: ["categoryId"],
      where: { supplierId: id, categoryId: { not: null } },
      _count: { _all: true },
    });
    const catIds = grouped.map((g) => g.categoryId).filter((x): x is number => x != null);
    const cats = await prisma.category.findMany({
      where: { id: { in: catIds } },
      select: { id: true, name: true, parent: { select: { name: true, group: { select: { name: true } } }, }, group: { select: { name: true } } },
    });
    const byId = new Map(cats.map((c) => [c.id, c]));
    const subs: SupSub[] = grouped.map((g) => {
      const c = byId.get(g.categoryId!);
      return {
        subId: g.categoryId!,
        subName: c?.name ?? "—",
        catName: c?.parent?.name ?? null,
        group: c?.group?.name ?? c?.parent?.group?.name ?? null,
        count: g._count._all,
      };
    }).sort((a, b) => b.count - a.count);
    return { ok: true, subs };
  } catch (err) {
    return actionError(err, "supplierSubcats");
  }
}

/** Ta'minotchi × subkategoriya bo'yicha SKU ro'yxati — lazy. */
export async function supplierSkusAction(
  supplierId: number,
  subId: number
): Promise<{ ok: true; products: SupSku[]; total: number } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const sid = z.coerce.number().int().positive().parse(supplierId);
    const cid = z.coerce.number().int().positive().parse(subId);
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { supplierId: sid, categoryId: cid },
        select: { code: true, name: true },
        orderBy: { name: "asc" },
        take: 250,
      }),
      prisma.product.count({ where: { supplierId: sid, categoryId: cid } }),
    ]);
    return { ok: true, products, total };
  } catch (err) {
    return actionError(err, "supplierSkus");
  }
}
