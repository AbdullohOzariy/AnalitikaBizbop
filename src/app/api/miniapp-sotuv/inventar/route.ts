/**
 * BizbopSotuv Mini App: inventarizatsiya.
 *   GET  — belgilangan SKU'lar + filialdagi tizim qoldig'i (ProductSales'dagi eng
 *          so'nggi snapshot) + bugungi kiritilgan sanash (davomiy tahrirlash uchun).
 *   POST — sanash natijalarini saqlash: (SKU × filial × bugun) upsert. systemQty
 *          faqat birinchi kiritishda muzlatiladi (snapshot), keyin o'zgarmaydi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { canDoInventory } from "@/lib/roles";
import { todayTashkentISO } from "@/lib/date";
import { decimalToNumber } from "@/lib/format";
import { authMiniapp, branchInScope, miniappXato, type MiniappUser } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bugungi Toshkent kuni — InventoryCount.sanaKuni (@db.Date, UTC yarim tun). */
function bugunSanaKuni(): { iso: string; date: Date } {
  const iso = todayTashkentISO();
  return { iso, date: new Date(iso + "T00:00:00.000Z") };
}

/**
 * Har mahsulot uchun filialdagi TIZIM qoldig'i — ProductSales'dagi eng so'nggi
 * davr snapshot'i (DISTINCT ON, periodEnd DESC). Snapshot yo'q = 0.
 */
async function latestStockByProduct(
  branchId: number,
  productIds: number[]
): Promise<Map<number, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ productId: number; qty: number }[]>(Prisma.sql`
    SELECT DISTINCT ON ("productId") "productId", COALESCE("stockQty", 0)::float8 AS qty
    FROM "ProductSales"
    WHERE "branchId" = ${branchId} AND "productId" = ANY(${productIds}::int[])
    ORDER BY "productId", "periodEnd" DESC
  `);
  return new Map(rows.map((r) => [r.productId, Number(r.qty)]));
}

/** Umumiy guard: rol (canDoInventory) + filial qamrovi. null = o'tdi. */
function inventarGuard(user: MiniappUser, branchId: number): NextResponse | null {
  if (!canDoInventory(user.roles)) return miniappXato("Ruxsat yo'q.", 403);
  if (!Number.isInteger(branchId) || branchId <= 0) return miniappXato("Filial noto'g'ri.", 400);
  if (!branchInScope(user.branchIds, branchId)) {
    return miniappXato("Bu filial sizning qamrovingizda emas.", 403);
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await authMiniapp(req, "inv");
  if ("fail" in auth) return auth.fail;
  const { user } = auth;

  const branchId = Number(new URL(req.url).searchParams.get("branchId"));
  const guard = inventarGuard(user, branchId);
  if (guard) return guard;

  const { iso: sanaKuni, date: sanaDate } = bugunSanaKuni();

  const items = await prisma.inventoryItem.findMany({
    select: { productId: true, product: { select: { code: true, name: true } } },
    orderBy: { product: { name: "asc" } },
  });

  const [stockMap, counts] = await Promise.all([
    latestStockByProduct(branchId, items.map((i) => i.productId)),
    prisma.inventoryCount.findMany({
      where: { branchId, sanaKuni: sanaDate },
      select: { productId: true, countedQty: true, note: true },
    }),
  ]);
  const countMap = new Map(counts.map((c) => [c.productId, c]));

  return NextResponse.json({
    ok: true,
    sanaKuni,
    items: items.map((i) => {
      const c = countMap.get(i.productId);
      return {
        productId: i.productId,
        code: i.product.code,
        name: i.product.name,
        systemQty: stockMap.get(i.productId) ?? 0,
        countedQty: c ? decimalToNumber(c.countedQty) : null,
        note: c?.note ?? null,
      };
    }),
  });
}

const postSchema = z.object({
  branchId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        countedQty: z.number().min(0).max(1_000_000_000),
        note: z.string().trim().max(500).optional(),
      })
    )
    .min(1)
    .max(500),
});

export async function POST(req: Request) {
  const auth = await authMiniapp(req, "inv-save", 20);
  if ("fail" in auth) return auth.fail;
  const { user } = auth;

  let p: z.infer<typeof postSchema>;
  try {
    p = postSchema.parse(await req.json());
  } catch {
    return miniappXato("Maydonlar to'liq emas yoki noto'g'ri.", 400);
  }

  const guard = inventarGuard(user, p.branchId);
  if (guard) return guard;

  // Dublikat productId — oxirgisi g'olib (upsert tartibi deterministik bo'lsin).
  const byId = new Map<number, (typeof p.items)[number]>();
  for (const it of p.items) byId.set(it.productId, it);
  const items = [...byId.values()];

  // Faqat belgilangan SKU ro'yxatidagilar qabul qilinadi.
  const allowed = await prisma.inventoryItem.findMany({
    where: { productId: { in: items.map((i) => i.productId) } },
    select: { productId: true },
  });
  const allowedSet = new Set(allowed.map((a) => a.productId));
  if (items.some((i) => !allowedSet.has(i.productId))) {
    return miniappXato("Ba'zi mahsulotlar inventar ro'yxatida yo'q.", 400);
  }

  const { date: sanaDate } = bugunSanaKuni();
  // Tizim qoldig'i — barcha itemlar uchun bitta so'rovda (create'da snapshot bo'ladi).
  const stockMap = await latestStockByProduct(p.branchId, items.map((i) => i.productId));

  await prisma.$transaction(
    items.map((it) =>
      prisma.inventoryCount.upsert({
        where: {
          productId_branchId_sanaKuni: {
            productId: it.productId,
            branchId: p.branchId,
            sanaKuni: sanaDate,
          },
        },
        create: {
          productId: it.productId,
          branchId: p.branchId,
          sanaKuni: sanaDate,
          systemQty: stockMap.get(it.productId) ?? 0,
          countedQty: it.countedQty,
          note: it.note?.length ? it.note : null,
          countedById: user.id,
        },
        // systemQty ATAYLAB yangilanmaydi — birinchi kiritilgandagi snapshot saqlanadi.
        update: {
          countedQty: it.countedQty,
          note: it.note?.length ? it.note : null,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, saved: items.length });
}
