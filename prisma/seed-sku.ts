/**
 * SKU iyerarxiya importi — `prisma/data/sku-hierarchy.json` (sku.xlsx'dan ajratilgan).
 *
 * TUZILMA: MARKET (ildiz, model'da kerak emas) → Guruh(3) → Kategoriya(21) →
 *          Subkategoriya(118) → SKU/Mahsulot(25 406). Kalit — 1C `code`.
 *
 * REJIM: TO'LIQ QAYTA QURISH. Mavjud iyerarxiya VA unga bog'liq sotuv fakti
 * (CategorySales/ProductSales) butunlay o'chiriladi, fayldan 0 dan quriladi.
 * (Foydalanuvchi tanlovi: "to'liq tozalab qayta qurish".)
 *
 * Ta'minotchi (POSTAVSHIK) ustuni HOZIRCHA import qilinmaydi — keyin alohida ulanadi.
 *
 * Ishga tushirish:  npm run db:seed-sku
 * Idempotent: har ishga tushirishda tozalab qayta quradi.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Group = { code: number; name: string; sortOrder: number };
type Cat = { code: number; name: string; groupCode: number; sortOrder: number };
type Sub = { code: number; name: string; categoryCode: number; sortOrder: number };
type Supplier = { name: string; sortOrder: number };
type Prod = { code: number; name: string; parentCode: number; supplier: string | null };
type Data = { meta: Record<string, unknown>; groups: Group[]; categories: Cat[]; subcategories: Sub[]; suppliers: Supplier[]; products: Prod[] };

const CHUNK = 5000; // Postgres parametr cheklovi (~65535) uchun mahsulotlarni bo'lib yozamiz

async function main() {
  const file = path.join(__dirname, "data", "sku-hierarchy.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Data;
  console.log("📥 Manba:", data.meta);

  // ── 1. TOZALASH (FK tartibida) ────────────────────────────────────────────
  console.log("🧹 Eski iyerarxiya va sotuv fakti o'chirilmoqda...");
  await prisma.productSales.deleteMany({});
  await prisma.categorySales.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.categoryAlias.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.categoryGroup.deleteMany({});

  // ── 2. GURUHLAR ────────────────────────────────────────────────────────────
  await prisma.categoryGroup.createMany({
    data: data.groups.map((g) => ({ name: g.name, code: g.code, sortOrder: g.sortOrder })),
  });
  const groupRows = await prisma.categoryGroup.findMany({ select: { id: true, code: true } });
  const groupId = new Map(groupRows.map((r) => [r.code!, r.id]));
  console.log(`✅ Guruh: ${groupRows.length}`);

  // ── 3. KATEGORIYALAR (parentId=null) ────────────────────────────────────────
  await prisma.category.createMany({
    data: data.categories.map((c) => ({
      name: c.name,
      code: c.code,
      sortOrder: c.sortOrder,
      groupId: groupId.get(c.groupCode) ?? null,
      parentId: null,
    })),
  });
  // kategoriya code → {id, groupId} (subkategoriya groupId'sini meros qilish uchun)
  const catRows = await prisma.category.findMany({ select: { id: true, code: true, groupId: true } });
  const catIdByCode = new Map(catRows.map((r) => [r.code!, r.id]));
  const catGroupByCode = new Map(catRows.map((r) => [r.code!, r.groupId]));
  console.log(`✅ Kategoriya: ${data.categories.length}`);

  // ── 4. SUBKATEGORIYALAR (parentId=kategoriya, groupId merosiy) ───────────────
  await prisma.category.createMany({
    data: data.subcategories.map((s) => ({
      name: s.name,
      code: s.code,
      sortOrder: s.sortOrder,
      parentId: catIdByCode.get(s.categoryCode) ?? null,
      groupId: catGroupByCode.get(s.categoryCode) ?? null,
    })),
  });
  console.log(`✅ Subkategoriya: ${data.subcategories.length}`);

  // barcha Category (kat+sub) code → id (mahsulotni biriktirish uchun)
  const allCatRows = await prisma.category.findMany({ select: { id: true, code: true } });
  const anyCatIdByCode = new Map(allCatRows.map((r) => [r.code!, r.id]));

  // ── 5. TA'MINOTCHILAR (POSTAVSHIK) ──────────────────────────────────────────
  await prisma.supplier.createMany({
    data: data.suppliers.map((s) => ({ name: s.name, sortOrder: s.sortOrder })),
  });
  const supRows = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const supIdByName = new Map(supRows.map((r) => [r.name, r.id]));
  console.log(`✅ Ta'minotchi: ${supRows.length}`);

  // ── 6. MAHSULOTLAR (SKU) — bo'lib yozamiz ───────────────────────────────────
  let inserted = 0;
  for (let i = 0; i < data.products.length; i += CHUNK) {
    const batch = data.products.slice(i, i + CHUNK).map((p) => ({
      code: p.code,
      name: p.name,
      categoryId: anyCatIdByCode.get(p.parentCode) ?? null,
      supplierId: p.supplier ? (supIdByName.get(p.supplier) ?? null) : null,
    }));
    const res = await prisma.product.createMany({ data: batch });
    inserted += res.count;
    console.log(`   …mahsulot ${inserted}/${data.products.length}`);
  }
  console.log(`✅ Mahsulot (SKU): ${inserted}`);

  // ── 7. Yakuniy tekshiruv ────────────────────────────────────────────────────
  const orphan = await prisma.product.count({ where: { categoryId: null } });
  console.log(`\n🎉 Tugadi. Guruh=${groupRows.length}, Kategoriya=${data.categories.length}, Subkategoriya=${data.subcategories.length}, Ta'minotchi=${supRows.length}, SKU=${inserted}`);
  if (orphan > 0) console.warn(`⚠️  Kategoriyasiz mahsulot: ${orphan} (parentCode topilmagan)`);
}

main()
  .catch((e) => { console.error("❌ Import xatosi:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
