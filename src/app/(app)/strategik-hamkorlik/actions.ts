"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isSupplyChain, isSystemAdmin } from "@/lib/roles";
import { actionError, type ActionResult } from "@/lib/action-error";
import { TAG_PARTNERSHIP } from "@/lib/cache-tags";

/** Yumshoq ustunlarni tahrirlash — SUPPLYCHAIN yoki SYSTEM_ADMIN. */
async function requireEdit() {
  const s = await auth();
  if (!s?.user || (!isSupplyChain(s.user.roles) && !isSystemAdmin(s.user.roles)))
    throw new Error("Ruxsat yo'q");
  return s.user;
}

// Foiz: -100..100 (rassrochka/promo/bonus musbat, spisaniye manfiy). null = override tozalash.
const pct = z.number().min(-100).max(100).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD bo'lishi kerak");

const saveSchema = z.object({
  supplierId: z.number().int().positive(),
  agentId: z.number().int().positive().nullable(),
  periodStart: isoDate,
  periodEnd: isoDate,
  promoCompPct: pct,
  rassrochkaPct: pct,
  bonusPct: pct,
  spisaniyePct: pct,
  abcOverride: z.string().trim().max(4).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export type SavePartnershipInput = z.input<typeof saveSchema>;

/**
 * Ta'minotchi (yoki brend) uchun davr yumshoq override'larini saqlaydi.
 * Faqat berilgan maydonlar yangilanadi (undefined = tegilmaydi); null = avtoga qaytarish.
 */
export async function savePartnershipOverride(input: SavePartnershipInput): Promise<ActionResult> {
  try {
    const user = await requireEdit();
    const d = saveSchema.parse(input);

    const startDate = new Date(`${d.periodStart}T00:00:00.000Z`);
    const endDate = new Date(`${d.periodEnd}T00:00:00.000Z`);

    // Faqat kiritilgan (input'da mavjud) maydonlarni yangilash uchun data quramiz.
    const data: Record<string, unknown> = { updatedById: Number(user.id) };
    if ("promoCompPct" in input) data.promoCompPct = d.promoCompPct ?? null;
    if ("rassrochkaPct" in input) data.rassrochkaPct = d.rassrochkaPct ?? null;
    if ("bonusPct" in input) data.bonusPct = d.bonusPct ?? null;
    if ("spisaniyePct" in input) data.spisaniyePct = d.spisaniyePct ?? null;
    if ("abcOverride" in input) data.abcOverride = d.abcOverride || null;
    if ("note" in input) data.note = d.note || null;

    const existing = await prisma.partnershipScorecard.findFirst({
      where: { supplierId: d.supplierId, agentId: d.agentId, periodStart: startDate, periodEnd: endDate },
      select: { id: true },
    });

    if (existing) {
      await prisma.partnershipScorecard.update({ where: { id: existing.id }, data });
    } else {
      await prisma.partnershipScorecard.create({
        data: {
          supplierId: d.supplierId,
          agentId: d.agentId,
          periodStart: startDate,
          periodEnd: endDate,
          ...data,
        },
      });
    }

    revalidateTag(TAG_PARTNERSHIP, "max");
    return { ok: true };
  } catch (err) {
    return actionError(err, "savePartnershipOverride");
  }
}
