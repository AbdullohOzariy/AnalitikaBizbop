"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requirePromoView, requirePromoEdit } from "@/lib/auth-helpers";
import { PROMO_CACHE_TAG } from "@/lib/promo";
import type { PromoCampaignRow } from "../doimiy/actions";

// Flash aksiyalar = PromoCampaign type=FLASH. SKU qatorlari (PromoItem) CRUD va
// SKU jadval doimiy bo'limdan qayta ishlatiladi (campaign turiga bog'liq emas).

type Err = { ok: false; error: string };
type Result = { ok: true } | Err;

const RP = "/promo/flash";
function invalidate() {
  revalidateTag(PROMO_CACHE_TAG, "max");
  revalidatePath(RP);
}
function xato(err: unknown): Err {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return { ok: false, error: "Topilmadi (allaqachon o'chirilgan bo'lishi mumkin)." };
    if (err.code === "P2003") return { ok: false, error: "Bog'liq yozuv topilmadi (filial)." };
  }
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  return { ok: false, error: msg };
}

const toDate = (s: string) => new Date(s + "T00:00:00.000Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");
const idSchema = z.coerce.number().int().positive();
const statusSchema = z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELLED"]);
const noteSchema = z.string().trim().max(1000).nullable().optional();

export async function listFlashAction(): Promise<{ ok: true; rows: PromoCampaignRow[] } | Err> {
  try {
    await requirePromoView();
    const rows = await prisma.promoCampaign.findMany({
      where: { type: "FLASH" },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      select: {
        id: true, type: true, title: true, status: true, startDate: true, endDate: true,
        branchId: true, note: true, createdAt: true,
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });
    return {
      ok: true,
      rows: rows.map((c): PromoCampaignRow => ({
        id: c.id, type: c.type, title: c.title, status: c.status,
        startDate: ymd(c.startDate),
        endDate: c.endDate ? ymd(c.endDate) : null,
        branchId: c.branchId, branchName: c.branch?.name ?? null,
        note: c.note,
        itemsCount: c._count.items,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  } catch (err) { return xato(err); }
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Nom kerak").max(200),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  note: noteSchema,
  branchId: idSchema.nullable().optional(),
});

export async function createFlashAction(input: {
  title: string; startDate: string; endDate?: string | null; note?: string | null; branchId?: number | null;
}): Promise<{ ok: true; id: number } | Err> {
  try {
    const user = await requirePromoEdit();
    const p = createSchema.parse(input);
    if (p.endDate && p.endDate < p.startDate) {
      return { ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas." };
    }
    const c = await prisma.promoCampaign.create({
      data: {
        type: "FLASH",
        title: p.title,
        status: "DRAFT",
        startDate: toDate(p.startDate),
        endDate: p.endDate ? toDate(p.endDate) : null,
        note: p.note || null,
        branchId: p.branchId ?? null,
        createdById: Number(user.id),
      },
      select: { id: true },
    });
    invalidate();
    return { ok: true, id: c.id };
  } catch (err) { return xato(err); }
}

const updateSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.nullable().optional(),
  note: noteSchema,
  branchId: idSchema.nullable().optional(),
  status: statusSchema.optional(),
});

export async function updateFlashAction(input: {
  id: number; title?: string; startDate?: string; endDate?: string | null; note?: string | null; branchId?: number | null; status?: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
}): Promise<Result> {
  try {
    await requirePromoEdit();
    const p = updateSchema.parse(input);
    if (p.startDate !== undefined && p.endDate && p.endDate < p.startDate) {
      return { ok: false, error: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas." };
    }
    const data: Prisma.PromoCampaignUpdateInput = {};
    if (p.title !== undefined) data.title = p.title;
    if (p.startDate !== undefined) data.startDate = toDate(p.startDate);
    if (p.endDate !== undefined) data.endDate = p.endDate ? toDate(p.endDate) : null;
    if (p.note !== undefined) data.note = p.note || null;
    if (p.status !== undefined) data.status = p.status;
    if (p.branchId !== undefined) {
      data.branch = p.branchId ? { connect: { id: p.branchId } } : { disconnect: true };
    }
    await prisma.promoCampaign.update({ where: { id: p.id }, data });
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}

export async function deleteFlashAction(input: { id: number }): Promise<Result> {
  try {
    await requirePromoEdit();
    const id = idSchema.parse(input.id);
    await prisma.promoCampaign.delete({ where: { id } }); // items Cascade
    invalidate();
    return { ok: true };
  } catch (err) { return xato(err); }
}
