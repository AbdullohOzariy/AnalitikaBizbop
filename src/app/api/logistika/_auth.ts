/**
 * Logistika miniapp API'lari uchun umumiy auth + yordamchilar.
 *
 * Haydovchi ERP'ga kirmaydi (NextAuth sessiyasi YO'Q) — u faqat Telegram
 * miniappda ishlaydi. Shu sababli yagona ishonch manbai: initData HMAC imzosi
 * (BOT_TOKEN bilan tasdiqlanadi) → Telegram user ID → Driver jadvali.
 *
 * MUHIM: driverId HAR DOIM shu yerdan olinadi, hech qachon request body'dan.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import { driverByTgId } from "@/lib/logistika/ruxsat";
import { TASHKENT_OFFSET_MS, todayTashkentISO } from "@/lib/date";

export type AuthDriver = { id: number; name: string };

/**
 * Haydovchini aniqlaydi. null = ruxsat yo'q (imzo yaroqsiz / haydovchi emas /
 * nofaol / so'rov toshqini).
 *
 * Limit ATAYLAB baland (daqiqasiga 120): miniapp har aksiyadan keyin holatni
 * qayta o'qiydi, normal ishlatishda bu ostona umuman urilmaydi — u faqat
 * suiiste'molni to'sadi. Limitga urilgan haydovchi 401 oladi va ilovani qayta
 * ochganda tiklanadi (oyna 1 daqiqa).
 */
export async function authDriver(
  req: Request,
  limit = 120
): Promise<{ driver: AuthDriver } | null> {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return null;
  if (!rateLimit(`logistika:${user.id}`, limit, 60_000)) return null;
  const d = await driverByTgId(user.id);
  if (!d) return null;
  return { driver: { id: d.id, name: d.name } };
}

/** 401 — kontrakt bo'yicha yagona matn. */
export function ruxsatYoq() {
  return NextResponse.json({ xato: "Ruxsat yo'q" }, { status: 401 });
}

/** 409 — do'stona xato (UI uni to'g'ridan-to'g'ri ko'rsatadi). */
export function xato409(matn: string) {
  return NextResponse.json({ ok: false, xato: matn }, { status: 409 });
}

/** 400 — body yaroqsiz. */
export function xato400(matn = "So'rov noto'g'ri") {
  return NextResponse.json({ ok: false, xato: matn }, { status: 400 });
}

/** 500 — kutilmagan xato (ichki tafsilot mijozga chiqarilmaydi). */
export function xato500(joy: string, err: unknown) {
  console.error(`[api/logistika/${joy}]`, err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, xato: "Server xatosi" }, { status: 500 });
}

// ─── Umumiy zod bo'laklari ───────────────────────────────────────────────────

/**
 * Koordinata — Decimal(9,6) ga sig'ishi shart. Miniapp GPS bermasa (yoki
 * rad etilsa) maydon umuman kelmaydi, shuning uchun optional.
 */
const kenglik = z.number().min(-90).max(90).optional();
const uzunlik = z.number().min(-180).max(180).optional();

/** Qurilma da'vosi: bosilgan payt. Server vaqtini ALMASHTIRMAYDI — yonma-yon yoziladi. */
const clientAt = z.string().datetime().optional();

export const gpsSchema = { lat: kenglik, lng: uzunlik, clientAt };

/** Idempotentlik kaliti — miniapp niyat paydo bo'lganda bir marta yaratadi. */
export const clientEventId = z.string().trim().min(8).max(100);

/** Decimal(9,6) — ortiqcha aniqlik Postgres'da xato bermasin. */
export function koord(n: number | undefined): number | undefined {
  return n === undefined ? undefined : Math.round(n * 1e6) / 1e6;
}

/** ISO satr → Date. Yaroqsiz bo'lsa undefined (fakt yozuvi baribir saqlanadi). */
export function sana(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ─── Vaqt ────────────────────────────────────────────────────────────────────

/** Toshkent devoriy vaqti bo'yicha "HH:MM" (xabar matnlari uchun). */
export function soat(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** Bugungi Toshkent kunining UTC chegaralari (hisoblagichlar uchun). */
export function bugunOraliq(): { boshi: Date; oxiri: Date } {
  const kun = todayTashkentISO();
  const boshi = new Date(new Date(`${kun}T00:00:00.000Z`).getTime() - TASHKENT_OFFSET_MS);
  return { boshi, oxiri: new Date(boshi.getTime() + 24 * 3_600_000) };
}

// ─── Qulf holati ─────────────────────────────────────────────────────────────

/**
 * "Band" xabari — moshina yoki haydovchi allaqachon yo'lda bo'lsa.
 *
 * Qulf ILOVA MANTIG'IDA EMAS, Postgres partial unique indekslarida
 * (Trip_open_per_vehicle_uniq / Trip_open_per_driver_uniq). Bu funksiya faqat
 * ODAMGA TUSHUNARLI matn yasaydi — INSERT'dan oldin ham, P2002'dan keyin ham
 * xuddi shu matn chiqadi, ya'ni javob deterministik.
 *
 * Faqat status='OPEN' qaraladi: STALE — qulf avtomatik bo'shatilgan holat,
 * u moshinani band qilmaydi (indeks ham shunday yozilgan).
 */
export async function bandXabar(
  vehicleId: number,
  driverId: number
): Promise<string | null> {
  const t = await prisma.trip.findFirst({
    where: { status: "OPEN", OR: [{ vehicleId }, { driverId }] },
    select: {
      vehicle: { select: { plateNumber: true } },
      driver: { select: { name: true } },
      legs: {
        orderBy: { seq: "desc" },
        take: 1,
        select: {
          departedAt: true,
          fromPoint: { select: { name: true } },
          toPoint: { select: { name: true } },
        },
      },
    },
  });
  if (!t) return null;

  const l = t.legs[0];
  const bolaklar = [t.driver.name];
  if (l) {
    bolaklar.push(`${l.fromPoint.name} → ${l.toPoint.name}`, soat(l.departedAt));
  }
  return `${t.vehicle.plateNumber} hozir yo'lda: ${bolaklar.join(", ")}`;
}

/** Prisma P2002 (unique buzilishi) — qulf yoki takroriy clientEventId. */
export function p2002(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}
