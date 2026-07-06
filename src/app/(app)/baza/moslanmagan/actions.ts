"use server";

import { TAG_IYERARXIYA } from "@/lib/cache-tags";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

type Result = { ok: true } | { ok: false; error: string };

/** Moslanmagan mahsulotga subkategoriya tayinlaydi (iyerarxiyaga joylashtiradi). */
export async function assignProductSubcatAction(productId: number, subId: number): Promise<Result> {
  try {
    await requireAdmin();
    const pid = z.coerce.number().int().positive().parse(productId);
    const sid = z.coerce.number().int().positive().parse(subId);
    // sid haqiqatan subkategoriya (parentId bor) ekanini tekshiramiz
    const sub = await prisma.category.findUnique({ where: { id: sid }, select: { parentId: true } });
    if (!sub || sub.parentId == null) return { ok: false, error: "Faqat subkategoriya tanlanishi mumkin." };
    await prisma.product.update({ where: { id: pid }, data: { categoryId: sid } });
    revalidatePath("/baza/moslanmagan");
    revalidateTag(TAG_IYERARXIYA, "max");
    // Sof foyda/marja hisoblari Product.categoryId orqali bog'langan — ular ham yangilansin.
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "assignProductSubcat");
  }
}

/** Mahsulot nomini tuzatadi. */
export async function renameProductAction(productId: number, name: string): Promise<Result> {
  try {
    await requireAdmin();
    const pid = z.coerce.number().int().positive().parse(productId);
    const nm = z.string().trim().min(1, "Nom kerak").max(255).parse(name);
    await prisma.product.update({ where: { id: pid }, data: { name: nm } });
    revalidatePath("/baza/moslanmagan");
    return { ok: true };
  } catch (err) {
    return actionError(err, "renameProduct");
  }
}

/** Nom farqi: fayldagi nomni master'ga qabul qiladi (yangilaydi) + farqni yopadi. */
export async function applyNameAction(productId: number): Promise<Result> {
  try {
    await requireAdmin();
    const pid = z.coerce.number().int().positive().parse(productId);
    const mm = await prisma.productNameMismatch.findUnique({ where: { productId: pid }, select: { fileName: true } });
    if (!mm) return { ok: false, error: "Farq topilmadi (allaqachon hal qilingan)." };
    await prisma.$transaction([
      prisma.product.update({ where: { id: pid }, data: { name: mm.fileName } }),
      prisma.productNameMismatch.delete({ where: { productId: pid } }),
    ]);
    revalidatePath("/baza/moslanmagan");
    revalidateTag(TAG_IYERARXIYA, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "applyName");
  }
}

/** Nom farqi: master nomini saqlab qoladi, farqni yopadi (e'tiborsiz qoldiradi). */
export async function dismissNameAction(productId: number): Promise<Result> {
  try {
    await requireAdmin();
    const pid = z.coerce.number().int().positive().parse(productId);
    await prisma.productNameMismatch.deleteMany({ where: { productId: pid } });
    revalidatePath("/baza/moslanmagan");
    return { ok: true };
  } catch (err) {
    return actionError(err, "dismissName");
  }
}
