/**
 * SKU katalogi — spisaniya miniapp uchun scope'langan kirish (asosiy Prisma baza).
 *
 * Xodimga (bizbop bot_ruxsat.telegram_id) `BotUserCategory` orqali Iyerarxiya
 * kategoriyalari biriktiriladi: OTA kategoriya (parentId=null) biriktirilsa —
 * barcha bolalari kiradi; SUBkategoriya bo'lsa — faqat o'zi. Xodimda yozuv
 * bo'lmasa = cheklov yo'q (to'liq katalog). Yozuvlar bizbop'da qoladi — bog'lanish
 * faqat sku_kod (Product.code) orqali, cross-DB JOIN yo'q.
 */
import { prisma } from "@/lib/prisma";

const SAHIFA = 50;
/** Product.code Int — Prisma Int chegarasidan oshgan qidiruv raqami kod deb qaralmaydi. */
const MAX_KOD = 2_147_483_647;

/** Ruxsat etilgan SUBkategoriya id to'plami; null = cheklovsiz (biriktirma yo'q). */
export async function getBotUserScope(telegramId: number | string): Promise<Set<number> | null> {
  const rows = await prisma.botUserCategory.findMany({
    where: { telegramId: BigInt(telegramId) },
    select: { categoryId: true, category: { select: { parentId: true } } },
  });
  if (rows.length === 0) return null;
  const otaIds = rows.filter((r) => r.category.parentId === null).map((r) => r.categoryId);
  const subIds = rows.filter((r) => r.category.parentId !== null).map((r) => r.categoryId);
  const subs = await prisma.category.findMany({
    where: {
      OR: [
        ...(otaIds.length ? [{ parentId: { in: otaIds } }] : []),
        ...(subIds.length ? [{ id: { in: subIds } }] : []),
      ],
    },
    select: { id: true },
  });
  return new Set(subs.map((s) => s.id));
}

export type SkuDaraxtOta = { id: number; nomi: string; subs: { id: number; nomi: string }[] };

/** Miniapp daraxti: ota kategoriyalar → (scope'dagi) sublar. Subsiz ota chiqmaydi. */
export async function skuDaraxt(scope: Set<number> | null): Promise<SkuDaraxtOta[]> {
  const otalar = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      },
    },
  });
  return otalar
    .map((o) => ({
      id: o.id,
      nomi: o.name,
      subs: o.children
        .filter((c) => !scope || scope.has(c.id))
        .map((c) => ({ id: c.id, nomi: c.name })),
    }))
    .filter((o) => o.subs.length > 0);
}

export type SkuRoyxat = { tovarlar: { kod: number; nomi: string }[]; jami: number; sahifa: number };

/** Bitta subkategoriya tovarlari (sahifalab). Scope'dan tashqari sub — bo'sh natija. */
export async function skuRoyxat(
  scope: Set<number> | null,
  subId: number,
  sahifa: number
): Promise<SkuRoyxat> {
  if (scope && !scope.has(subId)) return { tovarlar: [], jami: 0, sahifa };
  // code > 0 — "vaqtinchalik kod" (salbiy) SKU'lar katalogda ko'rinmaydi
  const where = { categoryId: subId, archivedAt: null, code: { gt: 0 } };
  const [rows, jami] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (sahifa - 1) * SAHIFA,
      take: SAHIFA,
      select: { code: true, name: true },
    }),
    prisma.product.count({ where }),
  ]);
  return { tovarlar: rows.map((r) => ({ kod: r.code, nomi: r.name })), jami, sahifa };
}

export type SkuQidiruvNatija = { natija: { kod: number; nomi: string; sub: string }[] };

/** Nom (ILIKE, trgm indeks) yoki aniq kod bo'yicha qidiruv — scope ichida, max 30. */
export async function skuQidiruv(scope: Set<number> | null, q: string): Promise<SkuQidiruvNatija> {
  const num = /^\d+$/.test(q) && Number(q) <= MAX_KOD ? Number(q) : null;
  const rows = await prisma.product.findMany({
    where: {
      archivedAt: null,
      code: { gt: 0 },
      ...(scope ? { categoryId: { in: [...scope] } } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(num !== null ? [{ code: num }] : []),
      ],
    },
    orderBy: { name: "asc" },
    take: 30,
    select: { code: true, name: true, category: { select: { name: true } } },
  });
  return { natija: rows.map((r) => ({ kod: r.code, nomi: r.name, sub: r.category?.name ?? "" })) };
}

// ─── Admin (sozlamalar sahifasi) uchun ma'lumot qatlami ────────────────────────

export type AdminKatGroup = {
  id: number;
  nomi: string;
  otalar: { id: number; nomi: string; subs: { id: number; nomi: string }[] }[];
};

/** To'liq iyerarxiya (bo'lim → ota → sub) — biriktirish dialogi uchun. */
export async function adminKategoriyaDaraxt(): Promise<AdminKatGroup[]> {
  const groups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      categories: {
        where: { parentId: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          children: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true },
          },
        },
      },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    nomi: g.name,
    otalar: g.categories.map((c) => ({
      id: c.id,
      nomi: c.name,
      subs: c.children.map((s) => ({ id: s.id, nomi: s.name })),
    })),
  }));
}

/** Barcha biriktirmalar: telegramId (string) → categoryId[]. */
export async function botUserBiriktirmalar(): Promise<Record<string, number[]>> {
  const rows = await prisma.botUserCategory.findMany({
    select: { telegramId: true, categoryId: true },
  });
  const map: Record<string, number[]> = {};
  for (const r of rows) (map[r.telegramId.toString()] ??= []).push(r.categoryId);
  return map;
}
