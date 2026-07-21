"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { canManageInventoryItems } from "@/lib/roles";
import { actionError } from "@/lib/action-error";
import { AuthorizationError } from "@/lib/auth-helpers";
import { decimalToNumber } from "@/lib/format";
import { parseCode } from "@/lib/parsers/utils";

// Ro'yxatni (belgilangan SKU'lar) boshqarish — faqat SYSTEM_ADMIN va CEO.
async function requireItemsManager() {
  const session = await auth();
  if (!session?.user || !canManageInventoryItems(session.user.roles)) {
    throw new AuthorizationError();
  }
  return session.user;
}

export type InventorySearchRow = {
  productId: number;
  code: number;
  name: string;
  subName: string | null;
  currentStock: number | null;
  inBranchIds: number[]; // qaysi filiallarda allaqachon ro'yxatda
};

// Filial tanlovi — kamida bitta, mavjud Branch id'lar (createMany FK baribir tekshiradi).
const branchIdsSchema = z.array(z.coerce.number().int().positive()).min(1, "Kamida bitta filial tanlang.").max(50);

const qSchema = z.string().trim().min(1, "Qidiruv so'zi bo'sh.").max(100);

/** SKU qidiruv (nom ILIKE yoki 1C kod aniq mos) — ro'yxatga qo'shish dialogi uchun. */
export async function searchProductsForInventoryAction(
  q: string
): Promise<{ ok: true; rows: InventorySearchRow[] } | { ok: false; error: string }> {
  try {
    await requireItemsManager();
    const query = qSchema.parse(q);
    const code = /^\d+$/.test(query) ? Number(query) : null;

    const products = await prisma.product.findMany({
      where: {
        archivedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          ...(code !== null ? [{ code }] : []),
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        currentStock: true,
        category: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      take: 20,
    });

    const existing = await prisma.inventoryItem.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      select: { productId: true, branchId: true },
    });
    const inBranches = new Map<number, number[]>();
    for (const e of existing) {
      inBranches.set(e.productId, [...(inBranches.get(e.productId) ?? []), e.branchId]);
    }

    return {
      ok: true,
      rows: products.map((p) => ({
        productId: p.id,
        code: p.code,
        name: p.name,
        subName: p.category?.name ?? null,
        currentStock: p.currentStock == null ? null : decimalToNumber(p.currentStock),
        inBranchIds: inBranches.get(p.id) ?? [],
      })),
    };
  } catch (err) {
    return actionError(err, "searchProductsForInventory");
  }
}

export type AutoFillMode = "oos" | "top";

/**
 * Avto to'ldirish — so'nggi mavjud kun snapshot'i bo'yicha HAR FILIAL kesimida top-50
 * (SKU × filial) juftlik o'sha filial ro'yxatiga qo'shiladi. Rejimlar:
 *   "oos" — qoldig'i ≤ 0, lekin sotuvi bor (muammoli, eng tekshirish zarur);
 *   "top" — oxirgi sotuvga ko'ra ENG KO'P sotilganlar (qoldiq holatidan qat'i nazar).
 * Allaqachon ro'yxatdagilar o'tkazib yuboriladi.
 */
export async function autoAddOosItemsAction(mode: AutoFillMode = "oos"): Promise<
  { ok: true; added: number; candidates: number; day: string } | { ok: false; error: string }
> {
  try {
    const user = await requireItemsManager();
    const m = z.enum(["oos", "top"]).parse(mode);
    // "oos" rejimida qo'shimcha shart: qoldiq ≤ 0 (muammoli). "top"da shart yo'q.
    const oosCond =
      m === "oos" ? Prisma.sql`AND ps."stockQty" IS NOT NULL AND ps."stockQty" <= 0` : Prisma.empty;

    // Faqat SO'NGGI mavjud kun (max periodEnd) — eski kunlardan ma'lumot olib kelmaymiz
    // (kunlik snapshot: periodStart == periodEnd; inventory-report bilan bir xil qoida).
    // Har filial kesimida top-50: (productId, branchId) juftliklar — ro'yxat ham filial-aware.
    const rows = await prisma.$queryRaw<{ productId: number; branchId: number; day: string }[]>(Prisma.sql`
      WITH mx AS (SELECT max("periodEnd") AS d FROM "ProductSales"),
      prob AS (
        SELECT ps."productId", ps."branchId",
               ROW_NUMBER() OVER (PARTITION BY ps."branchId" ORDER BY ps."soldQty" DESC) AS rn
        FROM "ProductSales" ps
        JOIN "Product" p ON p.id = ps."productId"
        WHERE ps."periodEnd" = (SELECT d FROM mx)
          AND ps."soldQty" IS NOT NULL AND ps."soldQty" > 0
          AND p."archivedAt" IS NULL
          ${oosCond}
      )
      SELECT "productId", "branchId", (SELECT d FROM mx)::text AS day
      FROM prob WHERE rn <= 50
    `);
    if (rows.length === 0) {
      return { ok: false, error: "Mos tovar topilmadi (so'nggi kun ma'lumotida)." };
    }

    const res = await prisma.inventoryItem.createMany({
      data: rows.map((r) => ({ productId: r.productId, branchId: r.branchId, createdById: Number(user.id) })),
      skipDuplicates: true, // allaqachon ro'yxatda borlari tegilmaydi
    });

    revalidatePath("/inventarizatsiya");
    return { ok: true, added: res.count, candidates: rows.length, day: rows[0].day.slice(0, 10) };
  } catch (err) {
    return actionError(err, "autoAddOosItems");
  }
}

/** SKU'ni tanlangan filial(lar) uchun inventarizatsiya ro'yxatiga qo'shish. */
export async function addInventoryItemAction(
  productId: number,
  branchIds: number[]
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    const user = await requireItemsManager();
    const pid = z.coerce.number().int().positive().parse(productId);
    const bids = branchIdsSchema.parse(branchIds);
    const res = await prisma.inventoryItem.createMany({
      data: bids.map((branchId) => ({ productId: pid, branchId, createdById: Number(user.id) })),
      skipDuplicates: true, // (SKU × filial) allaqachon bo'lsa tegilmaydi
    });
    revalidatePath("/inventarizatsiya");
    return { ok: true, added: res.count };
  } catch (err) {
    return actionError(err, "addInventoryItem");
  }
}

/**
 * Excel (xlsx/csv) orqali SKU kodlari ro'yxatini tanlangan filial(lar)ga qo'shish.
 * Fayl formati erkin: barcha kataklardan 1C kodi ko'rinishidagi qiymatlar olinadi
 * (raqam yoki "50 911" kabi probelli matn) va Product.code bilan solishtiriladi.
 */
export async function importInventoryItemsXlsxAction(
  formData: FormData
): Promise<
  | { ok: true; added: number; matched: number; unknownCodes: number[]; totalCodes: number }
  | { ok: false; error: string }
> {
  try {
    const user = await requireItemsManager();
    const bids = branchIdsSchema.parse(
      JSON.parse(String(formData.get("branchIds") ?? "[]")) as unknown
    );
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Fayl tanlanmagan." };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Fayl 5MB dan oshmasin." };

    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { ok: false, error: "Bo'sh fayl." };
    const aoa = XLSX.utils.sheet_to_json<(unknown | null)[]>(sheet, { header: 1, defval: null, raw: true });

    // Barcha kataklardan kod ko'rinishidagi qiymatlar (dublikatsiz)
    const codes = new Set<number>();
    for (const row of aoa) for (const cell of row ?? []) {
      const c = parseCode(cell);
      if (c != null) codes.add(c);
    }
    if (codes.size === 0) return { ok: false, error: "Faylda SKU kodlari topilmadi." };
    if (codes.size > 5000) return { ok: false, error: "Juda ko'p kod (>5000). Faylni bo'lib yuklang." };

    const products = await prisma.product.findMany({
      where: { code: { in: [...codes] }, archivedAt: null },
      select: { id: true, code: true },
    });
    const foundCodes = new Set(products.map((p) => p.code));
    const unknownCodes = [...codes].filter((c) => !foundCodes.has(c)).slice(0, 20);

    if (products.length === 0) {
      return { ok: false, error: "Hech bir kod bazadagi SKU'ga mos kelmadi." };
    }

    const res = await prisma.inventoryItem.createMany({
      data: products.flatMap((p) =>
        bids.map((branchId) => ({ productId: p.id, branchId, createdById: Number(user.id) }))
      ),
      skipDuplicates: true,
    });

    revalidatePath("/inventarizatsiya");
    return { ok: true, added: res.count, matched: products.length, unknownCodes, totalCodes: codes.size };
  } catch (err) {
    return actionError(err, "importInventoryItemsXlsx");
  }
}

/**
 * Ro'yxatni ommaviy tozalash — belgilangan SKU'lar (InventoryItem) o'chiriladi.
 * `branchId` berilsa faqat o'sha filial, aks holda BARCHA filiallar tozalanadi.
 * DIQQAT: bu faqat "sanash uchun belgilangan ro'yxat"; miniappda kiritilgan
 * haqiqiy sanoq natijalari (InventoryCount) alohida jadvalda va TEGILMAYDI.
 */
export async function clearInventoryItemsAction(
  // ATAYLAB majburiy va ATAYLAB `null` ni ochiq talab qiladi: eng buzg'unchi doira
  // ("barcha filiallar") hech qachon tushib qolgan/standart qiymat bo'lmasin.
  // `clearInventoryItemsAction()` deb chaqirib bo'lmaydi — kompilyator to'xtatadi.
  branchId: number | null
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  try {
    await requireItemsManager();
    // Mijoz filtriga ishonmaymiz: id shakli zod bilan, mavjudligi baza bilan tekshiriladi.
    const bid = z.coerce.number().int().positive().nullable().parse(branchId);
    if (bid !== null) {
      const branch = await prisma.branch.findUnique({ where: { id: bid }, select: { id: true } });
      if (!branch) return { ok: false, error: "Filial topilmadi." };
    }
    const res = await prisma.inventoryItem.deleteMany({
      where: bid === null ? {} : { branchId: bid },
    });
    revalidatePath("/inventarizatsiya");
    return { ok: true, deleted: res.count };
  } catch (err) {
    return actionError(err, "clearInventoryItems");
  }
}

/** SKU'ni inventarizatsiya ro'yxatidan o'chirish. */
export async function removeInventoryItemAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireItemsManager();
    const itemId = z.coerce.number().int().positive().parse(id);
    await prisma.inventoryItem.delete({ where: { id: itemId } });
    revalidatePath("/inventarizatsiya");
    return { ok: true };
  } catch (err) {
    return actionError(err, "removeInventoryItem");
  }
}
