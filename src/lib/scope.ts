/**
 * Kategoriya menejeri qamrovi (scope).
 *
 * CAT_MANAGER'ga rol berishda OTA-KATEGORIYALAR biriktiriladi (CategoryManager
 * jadvali, users sahifasida multi-select). Menejer faqat shu kategoriyalar
 * ma'lumotini ko'radi: buyurtma, OOS, Stockday, Dashboard v2.
 *
 * null  — cheklov yo'q (admin darajasi);
 * []    — CAT_MANAGER'ga hali kategoriya biriktirilmagan (hech narsa ko'rmaydi).
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAdminTier } from "@/lib/roles";

/** Qamrov o'zgarganda (setUserCategoriesAction) invalidatsiya qilinadigan tag. */
export const CAT_SCOPE_TAG = "cat-scope";

/** Biriktirilgan OTA-kategoriya id'lari. Admin — null (cheklovsiz). */
export function scopeParentIds(userId: number, role: string): Promise<number[] | null> {
  if (isAdminTier(role) || role === "CEO" || role === "SUPPLYCHAIN" || role === "HEAD_CAT_MANAGER") return Promise.resolve(null);
  return unstable_cache(
    async () => {
      const rows = await prisma.categoryManager.findMany({
        where: { userId },
        select: { categoryId: true },
      });
      return rows.map((r) => r.categoryId);
    },
    ["scopeParents", String(userId)],
    { tags: [CAT_SCOPE_TAG], revalidate: 300 }
  )();
}

/** Qamrovdagi SUBKATEGORIYA id'lari — CategorySales/Product.categoryId filtrlari uchun. */
export function scopeSubIds(userId: number, role: string): Promise<number[] | null> {
  if (isAdminTier(role) || role === "CEO" || role === "SUPPLYCHAIN" || role === "HEAD_CAT_MANAGER") return Promise.resolve(null);
  return unstable_cache(
    async () => {
      const parents = await prisma.categoryManager.findMany({
        where: { userId },
        select: { categoryId: true },
      });
      if (parents.length === 0) return [];
      const subs = await prisma.category.findMany({
        where: { parentId: { in: parents.map((p) => p.categoryId) } },
        select: { id: true },
      });
      return subs.map((s) => s.id);
    },
    // "iyerarxiya" ham: kategoriya ko'chirilsa subkat ro'yxati o'zgaradi
    ["scopeSubs", String(userId)],
    { tags: [CAT_SCOPE_TAG, "iyerarxiya"], revalidate: 300 }
  )();
}

/** Prisma where: mahsulot qamrovda (subkat'ning ota-kategoriyasi biriktirilgan). */
export function scopeProductWhere(scope: number[] | null) {
  return scope === null ? {} : { category: { parentId: { in: scope } } };
}
