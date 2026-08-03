"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";
import { canManageFinanceRefs } from "@/lib/roles";

const PATH = "/moliya/kontragentlar";

async function requireRefs() {
  const session = await auth();
  if (!session?.user || !canManageFinanceRefs(session.user.roles)) throw new AuthorizationError();
  return session.user;
}

const KINDS = ["EMPLOYEE", "SUPPLIER", "ACCOUNTABLE", "OTHER"] as const;

const saveSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, "Nom juda qisqa.").max(200),
  kind: z.enum(KINDS),
  supplierId: z.coerce.number().int().positive().nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function kontragentSaqlaAction(input: {
  id?: number;
  name: string;
  kind: (typeof KINDS)[number];
  supplierId?: number | null;
  phone?: string | null;
  note?: string | null;
  isActive?: boolean;
}): Promise<ActionResult> {
  try {
    await requireRefs();
    const d = saveSchema.parse(input);
    const data = {
      name: d.name,
      kind: d.kind,
      supplierId: d.supplierId ?? null,
      phone: d.phone || null,
      note: d.note || null,
      ...(d.isActive === undefined ? {} : { isActive: d.isActive }),
    };
    if (d.id) await prisma.counterparty.update({ where: { id: d.id }, data });
    else await prisma.counterparty.create({ data });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:kontragent");
  }
}

const mergeSchema = z.object({
  keepId: z.coerce.number().int().positive(),
  dropIds: z.array(z.coerce.number().int().positive()).min(1, "Birlashtiriladigan yozuv tanlanmagan."),
});

/**
 * Kontragentlarni BIRLASHTIRISH — "Азимов Акбар" / "Азамов Акбар" / "Акбар ака"
 * uchta alohida odam bo'lib qolmasligi uchun.
 *
 * Yo'qotiladigan yozuvlarning barcha kassa yozuvlari saqlanadiganga ko'chadi,
 * nomlari esa ALIAS bo'lib qoladi — kelajakdagi importda o'sha yozilish yana
 * to'g'ri kontragentga tushadi.
 */
export async function kontragentBirlashtirAction(input: {
  keepId: number;
  dropIds: number[];
}): Promise<ActionResult> {
  try {
    await requireRefs();
    const d = mergeSchema.parse(input);
    if (d.dropIds.includes(d.keepId))
      return { ok: false, error: "Saqlanadigan yozuvni o'ziga birlashtirib bo'lmaydi." };

    await prisma.$transaction(async (tx) => {
      const drops = await tx.counterparty.findMany({
        where: { id: { in: d.dropIds } },
        select: { id: true, name: true, aliases: { select: { alias: true } } },
      });

      // 1) Kassa yozuvlarini ko'chiramiz
      await tx.cashTxn.updateMany({
        where: { counterpartyId: { in: d.dropIds } },
        data: { counterpartyId: d.keepId },
      });

      // 2) Nom va mavjud aliaslarni saqlanadiganga alias qilib biriktiramiz.
      //    alias @unique — to'qnashuvda o'tkazib yuboramiz (skipDuplicates).
      const aliases = drops.flatMap((c) => [c.name, ...c.aliases.map((a) => a.alias)]);
      if (aliases.length > 0) {
        await tx.counterpartyAlias.createMany({
          data: aliases.map((alias) => ({ alias, counterpartyId: d.keepId })),
          skipDuplicates: true,
        });
      }

      // 3) Eski yozuvlarni o'chiramiz (aliaslari onDelete: Cascade bilan ketadi —
      //    shuning uchun ular yuqorida ALLAQACHON ko'chirilgan bo'lishi shart).
      await tx.counterparty.deleteMany({ where: { id: { in: d.dropIds } } });
    });

    revalidatePath(PATH);
    revalidatePath("/moliya/kassa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:kontragent-birlashtir");
  }
}

export async function kontragentOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireRefs();
    const cid = z.coerce.number().int().positive().parse(id);
    const ishlatilgan = await prisma.cashTxn.count({ where: { counterpartyId: cid } });
    if (ishlatilgan > 0) {
      return {
        ok: false,
        error: `Bu kontragentda ${ishlatilgan} ta yozuv bor — o'chirish o'rniga nofaol qiling yoki boshqasiga birlashtiring.`,
      };
    }
    await prisma.counterparty.delete({ where: { id: cid } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:kontragent-ochir");
  }
}
