"use server";

/**
 * Logistika ma'lumotnomasi — nuqta / avtomobil / haydovchi CRUD.
 *
 * Reys hujjatining o'zi (Trip/TripLeg) bu yerdan yaratilmaydi: uni haydovchi
 * miniappda ochadi, fors-major amallari esa /logistika/hozir da bo'ladi.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageReys } from "@/lib/roles";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, type ActionResult } from "@/lib/action-error";

async function requireReysManager() {
  const session = await auth();
  if (!session?.user || !canManageReys(session.user.roles)) throw new AuthorizationError();
  return session.user;
}

function revalidateAll() {
  revalidatePath("/logistika/malumotlar");
  revalidatePath("/logistika/hozir");
}

/** Postgres unique violation — Prisma xato kodi. */
function isUnique(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

// ─── NUQTALAR ────────────────────────────────────────────────────────────────

const nuqtaSchema = z.object({
  name: z.string().trim().min(1, "Nomi kerak").max(120),
  kind: z.enum(["WAREHOUSE", "BRANCH", "CITY", "OTHER"]),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  isHub: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  isLongHaul: z.boolean().optional(),
  staleHours: z.coerce.number().int().min(1).max(168).nullable().optional(),
});

export type NuqtaInput = z.input<typeof nuqtaSchema>;

export async function nuqtaSaqlaAction(
  id: number | null,
  input: NuqtaInput
): Promise<ActionResult> {
  try {
    await requireReysManager();
    const p = nuqtaSchema.parse(input);
    const data = {
      name: p.name,
      kind: p.kind,
      branchId: p.branchId ?? null,
      isHub: p.isHub ?? false,
      isActive: p.isActive ?? true,
      sortOrder: p.sortOrder ?? 0,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      isLongHaul: p.isLongHaul ?? false,
      staleHours: p.staleHours ?? null,
    };
    if (id) await prisma.logisticsPoint.update({ where: { id }, data });
    else await prisma.logisticsPoint.create({ data });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    if (isUnique(err)) return { ok: false, error: "Bunday nomli nuqta allaqachon bor." };
    return actionError(err, "nuqtaSaqla");
  }
}

export async function nuqtaOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireReysManager();
    const validId = z.coerce.number().int().positive().parse(id);
    // Reysda ishlatilgan nuqta o'chirilmaydi (FK Restrict) — nofaol qilish kerak.
    const ishlatilgan = await prisma.tripLeg.count({
      where: { OR: [{ fromPointId: validId }, { toPointId: validId }] },
    });
    if (ishlatilgan > 0) {
      return {
        ok: false,
        error: `Bu nuqta ${ishlatilgan} ta reysda ishlatilgan — o'chirib bo'lmaydi. Nofaol qilib qo'ying.`,
      };
    }
    await prisma.logisticsPoint.delete({ where: { id: validId } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return actionError(err, "nuqtaOchir");
  }
}

// ─── AVTOMOBILLAR ────────────────────────────────────────────────────────────

const avtoSchema = z.object({
  plateNumber: z.string().trim().min(1, "Davlat raqami kerak").max(20),
  brand: z.string().trim().min(1, "Marka kerak").max(60),
  model: z.string().trim().max(60).nullable().optional(),
  capacityM3: z.coerce.number().min(0).max(9999).nullable().optional(),
  capacityVagonetka: z.coerce.number().min(0).max(9999).nullable().optional(),
  insuranceUntil: z.string().trim().nullable().optional(),
  techInspectionUntil: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export type AvtoInput = z.input<typeof avtoSchema>;

/** "YYYY-MM-DD" → Date (UTC yarim tun). Bo'sh/noto'g'ri → null. */
function sanaOrNull(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function avtoSaqlaAction(
  id: number | null,
  input: AvtoInput
): Promise<ActionResult> {
  try {
    await requireReysManager();
    const p = avtoSchema.parse(input);
    const data = {
      plateNumber: p.plateNumber,
      brand: p.brand,
      model: p.model || null,
      capacityM3: p.capacityM3 ?? null,
      capacityVagonetka: p.capacityVagonetka ?? null,
      insuranceUntil: sanaOrNull(p.insuranceUntil),
      techInspectionUntil: sanaOrNull(p.techInspectionUntil),
      isActive: p.isActive ?? true,
      note: p.note || null,
    };
    if (id) await prisma.vehicle.update({ where: { id }, data });
    else await prisma.vehicle.create({ data });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    if (isUnique(err)) return { ok: false, error: "Bunday davlat raqami allaqachon bor." };
    return actionError(err, "avtoSaqla");
  }
}

export async function avtoOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireReysManager();
    const validId = z.coerce.number().int().positive().parse(id);
    const reyslar = await prisma.trip.count({ where: { vehicleId: validId } });
    if (reyslar > 0) {
      return {
        ok: false,
        error: `Bu avtoda ${reyslar} ta reys bor — o'chirib bo'lmaydi. Nofaol qilib qo'ying.`,
      };
    }
    await prisma.vehicle.delete({ where: { id: validId } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return actionError(err, "avtoOchir");
  }
}

// ─── HAYDOVCHILAR ────────────────────────────────────────────────────────────

const haydovchiSchema = z.object({
  name: z.string().trim().min(1, "Ism kerak").max(120),
  // Telegram user ID — miniapp shu orqali taniydi. Haydovchi botga /start bosgach
  // ID sini aytadi yoki nazoratchi "kutayotganlar" ro'yxatidan tanlaydi.
  tgUserId: z
    .string()
    .trim()
    .regex(/^\d{5,15}$/, "Telegram ID faqat raqamlardan iborat bo'lishi kerak"),
  phone: z.string().trim().max(30).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type HaydovchiInput = z.input<typeof haydovchiSchema>;

export async function haydovchiSaqlaAction(
  id: number | null,
  input: HaydovchiInput
): Promise<ActionResult> {
  try {
    await requireReysManager();
    const p = haydovchiSchema.parse(input);
    const data = {
      name: p.name,
      tgUserId: BigInt(p.tgUserId),
      phone: p.phone || null,
      isActive: p.isActive ?? true,
    };
    if (id) await prisma.driver.update({ where: { id }, data });
    else await prisma.driver.create({ data });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    if (isUnique(err))
      return { ok: false, error: "Bu Telegram ID boshqa haydovchiga biriktirilgan." };
    return actionError(err, "haydovchiSaqla");
  }
}

export async function haydovchiOchirAction(id: number): Promise<ActionResult> {
  try {
    await requireReysManager();
    const validId = z.coerce.number().int().positive().parse(id);
    const reyslar = await prisma.trip.count({ where: { driverId: validId } });
    if (reyslar > 0) {
      return {
        ok: false,
        error: `Bu haydovchida ${reyslar} ta reys bor — o'chirib bo'lmaydi. Nofaol qilib qo'ying.`,
      };
    }
    await prisma.driver.delete({ where: { id: validId } });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return actionError(err, "haydovchiOchir");
  }
}
