"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageInventoryItems } from "@/lib/roles";
import { actionError } from "@/lib/action-error";
import { AuthorizationError } from "@/lib/auth-helpers";
import { decimalToNumber } from "@/lib/format";

// Ro'yxatni (belgilangan SKU'lar) boshqarish — faqat SYSTEM_ADMIN va CEO.
async function requireItemsManager() {
  const session = await auth();
  if (!session?.user || !canManageInventoryItems(session.user.roles)) {
    throw new AuthorizationError();
  }
  return session.user;
}

export type InventorySearchRow = {
  productId: number;
  code: number;
  name: string;
  subName: string | null;
  currentStock: number | null;
  inList: boolean; // allaqachon inventarizatsiya ro'yxatida
};

const qSchema = z.string().trim().min(1, "Qidiruv so'zi bo'sh.").max(100);

/** SKU qidiruv (nom ILIKE yoki 1C kod aniq mos) — ro'yxatga qo'shish dialogi uchun. */
export async function searchProductsForInventoryAction(
  q: string
): Promise<{ ok: true; rows: InventorySearchRow[] } | { ok: false; error: string }> {
  try {
    await requireItemsManager();
    const query = qSchema.parse(q);
    const code = /^\d+$/.test(query) ? Number(query) : null;

    const products = await prisma.product.findMany({
      where: {
        archivedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          ...(code !== null ? [{ code }] : []),
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        currentStock: true,
        category: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      take: 20,
    });

    const existing = await prisma.inventoryItem.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      select: { productId: true },
    });
    const inList = new Set(existing.map((e) => e.productId));

    return {
      ok: true,
      rows: products.map((p) => ({
        productId: p.id,
        code: p.code,
        name: p.name,
        subName: p.category?.name ?? null,
        currentStock: p.currentStock == null ? null : decimalToNumber(p.currentStock),
        inList: inList.has(p.id),
      })),
    };
  } catch (err) {
    return actionError(err, "searchProductsForInventory");
  }
}

/** SKU'ni inventarizatsiya ro'yxatiga qo'shish. */
export async function addInventoryItemAction(
  productId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireItemsManager();
    const pid = z.coerce.number().int().positive().parse(productId);
    await prisma.inventoryItem.create({
      data: { productId: pid, createdById: Number(user.id) },
    });
    revalidatePath("/inventarizatsiya");
    return { ok: true };
  } catch (err) {
    // P2002 (productId unique) — actionError "allaqachon mavjud" deb qaytaradi
    return actionError(err, "addInventoryItem");
  }
}

/** SKU'ni inventarizatsiya ro'yxatidan o'chirish. */
export async function removeInventoryItemAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireItemsManager();
    const itemId = z.coerce.number().int().positive().parse(id);
    await prisma.inventoryItem.delete({ where: { id: itemId } });
    revalidatePath("/inventarizatsiya");
    return { ok: true };
  } catch (err) {
    return actionError(err, "removeInventoryItem");
  }
}
