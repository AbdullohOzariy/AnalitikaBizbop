/**
 * Bir martalik data migration:
 * 1. CategoryGroup larni yaratadi (FRESH, FOOD, NON-FOOD)
 * 2. Mavjud kategoriyalarni yangi nomga o'zgartiradi
 * 3. Har bir kategoriyaga groupId belgilaydi
 * 4. Yangi kategoriyalarni yaratadi (TUXUM, TAYYOR MAHSULOT, ...)
 * 5. Eski nomlarni CategoryAlias sifatida saqlaydi
 * 6. Subkategoriyalarni yaratadi (parentId bilan)
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── Guruhlar ───────────────────────────────────────────────────────────────

const GROUPS = [
  { name: "FRESH",    sortOrder: 1 },
  { name: "FOOD",     sortOrder: 2 },
  { name: "NON-FOOD", sortOrder: 3 },
];

// ─── Kategoriyalar: { newName, groupName, sortOrder, oldName? } ──────────────
// oldName mavjud bo'lsa — eski nom yangi nomga o'zgartiriladi va alias sifatida saqlanadi

const CATEGORIES: {
  newName: string;
  groupName: string;
  sortOrder: number;
  oldName?: string;
}[] = [
  // FRESH
  { newName: "MOLOCHKA",            groupName: "FRESH",    sortOrder: 1  },
  { newName: "MYASNOY",             groupName: "FRESH",    sortOrder: 2  },
  { newName: "OVOSH I FRUKTI",      groupName: "FRESH",    sortOrder: 3,  oldName: "OVOSHI I FRUKTI" },
  { newName: "KOLBASNIY",           groupName: "FRESH",    sortOrder: 4  },
  { newName: "TUXUM",               groupName: "FRESH",    sortOrder: 5  },
  { newName: "TAYYOR MAHSULOT",     groupName: "FRESH",    sortOrder: 6  },
  { newName: "XLEB I KONDITERSKIY", groupName: "FRESH",    sortOrder: 7  },
  // FOOD
  { newName: "BAKALEYA",            groupName: "FOOD",     sortOrder: 8  },
  { newName: "KOFE I CHAY",         groupName: "FOOD",     sortOrder: 9  },
  { newName: "SHIRINLIKLAR",        groupName: "FOOD",     sortOrder: 10, oldName: "KONFETI I SHOKOLAD" },
  { newName: "SNACK&QURUQ MEVALAR", groupName: "FOOD",     sortOrder: 11, oldName: "SNEKI" },
  { newName: "SOK I NAPITKI",       groupName: "FOOD",     sortOrder: 12, oldName: "SOKI I NAPITKI" },
  { newName: "ZAMOROZKA",           groupName: "FOOD",     sortOrder: 13 },
  { newName: "DETSOE PITANIE",      groupName: "FOOD",     sortOrder: 14 },
  // NON-FOOD
  { newName: "CHISTYASHIE SREDSTO", groupName: "NON-FOOD", sortOrder: 15, oldName: "CHISTYASHIE SREDSTVI" },
  { newName: "DETSKIY",             groupName: "NON-FOOD", sortOrder: 16 },
  { newName: "IGRUSHKI",            groupName: "NON-FOOD", sortOrder: 17 },
  { newName: "KONSTOVAR",           groupName: "NON-FOOD", sortOrder: 18, oldName: "KONSTOVARI" },
  { newName: "PARFYUMERIYA",        groupName: "NON-FOOD", sortOrder: 19, oldName: "PARFUMERIYA" },
  { newName: "XOZ TOVAR",           groupName: "NON-FOOD", sortOrder: 20, oldName: "XOZ TOVARI" },
  { newName: "ZOOTOVAR",            groupName: "NON-FOOD", sortOrder: 21 },
];

// Saqlanib qoladigan, lekin guruhi yo'q kategoriyalar (sortOrder=0, ko'rinmaydi)
const KEEP_HIDDEN = ["KASSA", "SUXIE FRUKTI"];

// ─── Subkategoriyalar ────────────────────────────────────────────────────────

const SUBCATEGORIES: { parentName: string; name: string; sortOrder: number }[] = [
  // MOLOCHKA
  { parentName: "MOLOCHKA", name: "SUT",              sortOrder: 1 },
  { parentName: "MOLOCHKA", name: "AYRON VA QURTOBA", sortOrder: 2 },
  { parentName: "MOLOCHKA", name: "YOGURT",           sortOrder: 3 },
  { parentName: "MOLOCHKA", name: "KEFIR",            sortOrder: 4 },
  { parentName: "MOLOCHKA", name: "QATIQ",            sortOrder: 5 },
  { parentName: "MOLOCHKA", name: "QAYMOQ",           sortOrder: 6 },
  { parentName: "MOLOCHKA", name: "SMETANA",          sortOrder: 7 },
  { parentName: "MOLOCHKA", name: "SUZMA",            sortOrder: 8 },
  { parentName: "MOLOCHKA", name: "TVOROG",           sortOrder: 9 },
  { parentName: "MOLOCHKA", name: "BRINZA",           sortOrder: 10 },
  { parentName: "MOLOCHKA", name: "KOKTEYL",          sortOrder: 11 },
  { parentName: "MOLOCHKA", name: "PISHLOQ (SLIVOCHNIY)", sortOrder: 12 },
  { parentName: "MOLOCHKA", name: "SARIYOG'",         sortOrder: 13 },
  { parentName: "MOLOCHKA", name: "MARGARIN",         sortOrder: 14 },
  { parentName: "MOLOCHKA", name: "SGUSHENKA",        sortOrder: 15 },
  // MYASNOY
  { parentName: "MYASNOY", name: "MOL GO'SHTI",       sortOrder: 1 },
  { parentName: "MYASNOY", name: "QO'Y GO'SHTI",      sortOrder: 2 },
  { parentName: "MYASNOY", name: "PARRANDA GO'SHTI",  sortOrder: 3 },
  // OVOSH I FRUKTI
  { parentName: "OVOSH I FRUKTI", name: "MESTNIY MEVALAR",  sortOrder: 1 },
  { parentName: "OVOSH I FRUKTI", name: "SITRUS MEVALAR",   sortOrder: 2 },
  { parentName: "OVOSH I FRUKTI", name: "SABZAVOTLAR",      sortOrder: 3 },
  { parentName: "OVOSH I FRUKTI", name: "KO'KATLAR",        sortOrder: 4 },
  { parentName: "OVOSH I FRUKTI", name: "POLIZ EKINLARI",   sortOrder: 5 },
  // KOLBASNIY
  { parentName: "KOLBASNIY", name: "VARYONNAYA KOLBASA",   sortOrder: 1 },
  { parentName: "KOLBASNIY", name: "KOPCHYONNAYA KOLBASA", sortOrder: 2 },
  { parentName: "KOLBASNIY", name: "P/K KOLBASA",          sortOrder: 3 },
  { parentName: "KOLBASNIY", name: "SOSISKA",              sortOrder: 4 },
  { parentName: "KOLBASNIY", name: "DELIKATES",            sortOrder: 5 },
  { parentName: "KOLBASNIY", name: "PISHLOQ (KOLBASNIY)",  sortOrder: 6 },
  // TUXUM
  { parentName: "TUXUM", name: "BEDANA TUXUMI", sortOrder: 1 },
  { parentName: "TUXUM", name: "TOVUQ TUXUMI",  sortOrder: 2 },
  // TAYYOR MAHSULOT
  { parentName: "TAYYOR MAHSULOT", name: "SALAT",           sortOrder: 1 },
  { parentName: "TAYYOR MAHSULOT", name: "MAZZONA TAOMLARI",sortOrder: 2 },
  { parentName: "TAYYOR MAHSULOT", name: "LAG'MON",         sortOrder: 3 },
  // XLEB I KONDITERSKIY
  { parentName: "XLEB I KONDITERSKIY", name: "NON",         sortOrder: 1 },
  { parentName: "XLEB I KONDITERSKIY", name: "BULOCHKA",    sortOrder: 2 },
  { parentName: "XLEB I KONDITERSKIY", name: "PISHIRIQLAR", sortOrder: 3 },
  { parentName: "XLEB I KONDITERSKIY", name: "TORT",        sortOrder: 4 },
  // BAKALEYA
  { parentName: "BAKALEYA", name: "KONSERVA",               sortOrder: 1 },
  { parentName: "BAKALEYA", name: "DUKKAKLI MAHSULOTLAR",   sortOrder: 2 },
  { parentName: "BAKALEYA", name: "TOMAT",                  sortOrder: 3 },
  { parentName: "BAKALEYA", name: "MARINAD",                sortOrder: 4 },
  { parentName: "BAKALEYA", name: "SOUS",                   sortOrder: 5 },
  { parentName: "BAKALEYA", name: "MAYONEZ VA KETCHUP",     sortOrder: 6 },
  { parentName: "BAKALEYA", name: "ZIRAVORLAR",             sortOrder: 7 },
  { parentName: "BAKALEYA", name: "UNLAR",                  sortOrder: 8 },
  { parentName: "BAKALEYA", name: "TUZ",                    sortOrder: 9 },
  { parentName: "BAKALEYA", name: "SHAKAR",                 sortOrder: 10 },
  { parentName: "BAKALEYA", name: "MOY",                    sortOrder: 11 },
  { parentName: "BAKALEYA", name: "MAKARON",                sortOrder: 12 },
  { parentName: "BAKALEYA", name: "SIRKA",                  sortOrder: 13 },
  // KOFE I CHAY
  { parentName: "KOFE I CHAY", name: "KOFE",       sortOrder: 1 },
  { parentName: "KOFE I CHAY", name: "CHOY",       sortOrder: 2 },
  { parentName: "KOFE I CHAY", name: "KAKAO",      sortOrder: 3 },
  { parentName: "KOFE I CHAY", name: "SLIVKI",     sortOrder: 4 },
  { parentName: "KOFE I CHAY", name: "TSIKORIY",   sortOrder: 5 },
  { parentName: "KOFE I CHAY", name: "DIABET UCHUN",sortOrder: 6 },
  // SHIRINLIKLAR
  { parentName: "SHIRINLIKLAR", name: "KONFET",                  sortOrder: 1 },
  { parentName: "SHIRINLIKLAR", name: "SHOKOLAD",                sortOrder: 2 },
  { parentName: "SHIRINLIKLAR", name: "BISKVIT",                 sortOrder: 3 },
  { parentName: "SHIRINLIKLAR", name: "PECHENIE",                sortOrder: 4 },
  { parentName: "SHIRINLIKLAR", name: "VAFLI",                   sortOrder: 5 },
  { parentName: "SHIRINLIKLAR", name: "MARMELAD",                sortOrder: 6 },
  { parentName: "SHIRINLIKLAR", name: "ZEFIR",                   sortOrder: 7 },
  { parentName: "SHIRINLIKLAR", name: "KARAMEL",                 sortOrder: 8 },
  { parentName: "SHIRINLIKLAR", name: "SHARQONA SHIRINLIKLAR",   sortOrder: 9 },
  // SNACK&QURUQ MEVALAR
  { parentName: "SNACK&QURUQ MEVALAR", name: "CHIPS",    sortOrder: 1 },
  { parentName: "SNACK&QURUQ MEVALAR", name: "SUXARIKI", sortOrder: 2 },
  { parentName: "SNACK&QURUQ MEVALAR", name: "POPCORN",  sortOrder: 3 },
  { parentName: "SNACK&QURUQ MEVALAR", name: "SEMECHKA", sortOrder: 4 },
  { parentName: "SNACK&QURUQ MEVALAR", name: "QURT",     sortOrder: 5 },
  { parentName: "SNACK&QURUQ MEVALAR", name: "QURUQ MEVALAR", sortOrder: 6 },
  // SOK I NAPITKI
  { parentName: "SOK I NAPITKI", name: "GAZLI ICHIMLIKLAR", sortOrder: 1 },
  { parentName: "SOK I NAPITKI", name: "SUV",               sortOrder: 2 },
  { parentName: "SOK I NAPITKI", name: "SHARBATLAR",        sortOrder: 3 },
  { parentName: "SOK I NAPITKI", name: "LIMONADLAR",        sortOrder: 4 },
  { parentName: "SOK I NAPITKI", name: "YAXNA CHOYLAR",     sortOrder: 5 },
  // ZAMOROZKA
  { parentName: "ZAMOROZKA", name: "YARIMTAYYOR MAHSULOTLAR", sortOrder: 1 },
  { parentName: "ZAMOROZKA", name: "SIROK",                   sortOrder: 2 },
  { parentName: "ZAMOROZKA", name: "MUZQAYMOQ",               sortOrder: 3 },
  { parentName: "ZAMOROZKA", name: "MUZLATILGAN MEVALAR",     sortOrder: 4 },
  // DETSOE PITANIE
  { parentName: "DETSOE PITANIE", name: "SMES",           sortOrder: 1 },
  { parentName: "DETSOE PITANIE", name: "PECHENIE (BOLA)",sortOrder: 2 },
  { parentName: "DETSOE PITANIE", name: "PYURE",          sortOrder: 3 },
  { parentName: "DETSOE PITANIE", name: "KASHA",          sortOrder: 4 },
  { parentName: "DETSOE PITANIE", name: "TAYYOR NONUSHTA",sortOrder: 5 },
  // CHISTYASHIE SREDSTO
  { parentName: "CHISTYASHIE SREDSTO", name: "OSHXONA UCHUN",  sortOrder: 1 },
  { parentName: "CHISTYASHIE SREDSTO", name: "KIR YUVISH UCHUN",sortOrder: 2 },
  { parentName: "CHISTYASHIE SREDSTO", name: "OYNALAR",        sortOrder: 3 },
  { parentName: "CHISTYASHIE SREDSTO", name: "OSVEJITEL",       sortOrder: 4 },
  { parentName: "CHISTYASHIE SREDSTO", name: "SAN UZEL UCHUN", sortOrder: 5 },
  // DETSKIY
  { parentName: "DETSKIY", name: "BOLALAR GIGIYENASI", sortOrder: 1 },
  // IGRUSHKI
  { parentName: "IGRUSHKI", name: "BOLALAR UCHUN",         sortOrder: 1 },
  { parentName: "IGRUSHKI", name: "SUVENIRLAR",            sortOrder: 2 },
  { parentName: "IGRUSHKI", name: "MAVSUMIY O'YINCHOQLAR", sortOrder: 3 },
  // KONSTOVAR
  { parentName: "KONSTOVAR", name: "QOG'OZ MAHSULOTLAR", sortOrder: 1 },
  { parentName: "KONSTOVAR", name: "RASM ASHYOLARI",      sortOrder: 2 },
  { parentName: "KONSTOVAR", name: "YOZUV ASHYOLARI",     sortOrder: 3 },
  { parentName: "KONSTOVAR", name: "O'LCHOV ASBOBLARI",   sortOrder: 4 },
  // PARFYUMERIYA
  { parentName: "PARFYUMERIYA", name: "SOCH UCHUN",        sortOrder: 1 },
  { parentName: "PARFYUMERIYA", name: "TANA UCHUN",        sortOrder: 2 },
  { parentName: "PARFYUMERIYA", name: "YUZ UCHUN",         sortOrder: 3 },
  { parentName: "PARFYUMERIYA", name: "AYOLLAR GIGIYENASI",sortOrder: 4 },
  { parentName: "PARFYUMERIYA", name: "OG'IZ UCHUN",       sortOrder: 5 },
  { parentName: "PARFYUMERIYA", name: "GIGIYENA",          sortOrder: 6 },
  // XOZ TOVAR
  { parentName: "XOZ TOVAR", name: "UY UCHUN",         sortOrder: 1 },
  { parentName: "XOZ TOVAR", name: "HOVLI UCHUN",      sortOrder: 2 },
  { parentName: "XOZ TOVAR", name: "OSHXONA ANJOMLARI",sortOrder: 3 },
  // ZOOTOVAR
  { parentName: "ZOOTOVAR", name: "KORM",        sortOrder: 1 },
  { parentName: "ZOOTOVAR", name: "AKSESSUARLAR",sortOrder: 2 },
  { parentName: "ZOOTOVAR", name: "GIGIYENA (ZOO)", sortOrder: 3 },
];

async function main() {
  console.log("→ 1. CategoryGroup larni yaratish...");
  const groupMap = new Map<string, number>();
  for (const g of GROUPS) {
    const group = await prisma.categoryGroup.upsert({
      where: { name: g.name },
      update: { sortOrder: g.sortOrder },
      create: { name: g.name, sortOrder: g.sortOrder },
    });
    groupMap.set(g.name, group.id);
    console.log(`  ✓ ${g.name} (id=${group.id})`);
  }

  console.log("\n→ 2. Kategoriyalarni yangilash va nomlarni o'zgartirish...");
  const categoryMap = new Map<string, number>(); // newName → id

  for (const cat of CATEGORIES) {
    const groupId = groupMap.get(cat.groupName)!;

    if (cat.oldName) {
      // Eski nom bilan mavjud kategoriyani topib yangi nomga o'zgartirish
      const existing = await prisma.category.findUnique({ where: { name: cat.oldName } });
      if (existing) {
        await prisma.category.update({
          where: { id: existing.id },
          data: { name: cat.newName, groupId, sortOrder: cat.sortOrder },
        });
        // Eski nomni alias sifatida saqlash (agar hali yo'q bo'lsa)
        await prisma.categoryAlias.upsert({
          where: { alias: cat.oldName },
          update: { categoryId: existing.id },
          create: { categoryId: existing.id, alias: cat.oldName },
        });
        categoryMap.set(cat.newName, existing.id);
        console.log(`  ✓ "${cat.oldName}" → "${cat.newName}" (alias saqlandi)`);
        continue;
      }
    }

    // Mavjud yoki yangi kategoriyani upsert qilish
    const category = await prisma.category.upsert({
      where: { name: cat.newName },
      update: { groupId, sortOrder: cat.sortOrder },
      create: { name: cat.newName, groupId, sortOrder: cat.sortOrder },
    });
    categoryMap.set(cat.newName, category.id);
    console.log(`  ✓ "${cat.newName}" (${cat.oldName ? "yangi" : "mavjud yoki yangi"})`);
  }

  console.log("\n→ 3. Ko'rinmaydigan kategoriyalarni sortOrder=0 saqlab qo'yish...");
  for (const name of KEEP_HIDDEN) {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { sortOrder: 0, groupId: null },
      });
      console.log(`  ✓ "${name}" — sortOrder=0 (ko'rinmaydi)`);
    }
  }

  console.log("\n→ 4. Subkategoriyalarni yaratish...");
  for (const sub of SUBCATEGORIES) {
    const parentId = categoryMap.get(sub.parentName);
    if (!parentId) {
      console.warn(`  ⚠ Parent topilmadi: "${sub.parentName}" — "${sub.name}" o'tkazib yuborildi`);
      continue;
    }
    await prisma.category.upsert({
      where: { name: sub.name },
      update: { parentId, sortOrder: 0 },
      create: { name: sub.name, parentId, sortOrder: 0 },
    });
  }
  console.log(`  ✓ ${SUBCATEGORIES.length} ta subkategoriya yaratildi/yangilandi`);

  console.log("\n✓ Migration muvaffaqiyatli yakunlandi!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
