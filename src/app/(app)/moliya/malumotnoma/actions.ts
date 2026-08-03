"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { canManageFinanceRefs } from "@/lib/roles";

const PATH = "/moliya/malumotnoma";

/** Moliya ma'lumotnomasini tahrirlash huquqi — SYSTEM_ADMIN va FINANCE.
 *  Read-only ADMIN/CEO bu yerdan O'TMAYDI. */
async function requireFinanceRefs() {
  const session = await auth();
  if (!session?.user || !canManageFinanceRefs(session.user.roles)) {
    throw new AuthorizationError();
  }
  return session.user;
}

const articleSchema = z.object({
  id: z.coerce.number().int().positive(),
  groupId: z.coerce.number().int().positive().optional(),
  direction: z.enum(["IN_ONLY", "OUT_ONLY", "BOTH"]).optional(),
  isNeutral: z.boolean().optional(),
  isTransfer: z.boolean().optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export async function moddaYangilaAction(input: {
  id: number;
  groupId?: number;
  direction?: "IN_ONLY" | "OUT_ONLY" | "BOTH";
  isNeutral?: boolean;
  isTransfer?: boolean;
  isActive?: boolean;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    await requireFinanceRefs();
    const data = articleSchema.parse(input);
    const { id, ...rest } = data;

    // Transfer moddasi HAR DOIM neytral: pul kompaniya ichida ko'chadi, xarajat emas.
    // isTransfer yoqilsa isNeutral avtomatik yoqiladi (foydalanuvchi unutib qo'ymasin).
    if (rest.isTransfer === true) rest.isNeutral = true;

    // Transfer ikki tomonlama yoziladi — yo'nalishi cheklanmaydi.
    if (rest.isTransfer === true) rest.direction = "BOTH";

    await prisma.cashFlowArticle.update({ where: { id }, data: rest });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:modda");
  }
}

const aliasSchema = z.object({
  articleId: z.coerce.number().int().positive(),
  alias: z
    .string()
    .trim()
    .min(1, "Alias bo'sh bo'lmasin.")
    .max(255, "Alias juda uzun."),
});

export async function aliasQoshAction(input: {
  articleId: number;
  alias: string;
}): Promise<ActionResult> {
  try {
    await requireFinanceRefs();
    const { articleId, alias } = aliasSchema.parse(input);
    await prisma.cashFlowArticleAlias.create({ data: { articleId, alias } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:alias-qosh");
  }
}

export async function aliasOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireFinanceRefs();
    await prisma.cashFlowArticleAlias.delete({
      where: { id: z.coerce.number().int().positive().parse(id) },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:alias-ochir");
  }
}
