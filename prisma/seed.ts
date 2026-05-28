import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { Role, AliasSource } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BRANCHES = [
  {
    name: "Mega Center",
    sortOrder: 1,
    aliases: [
      { alias: "Market MEGA market", source: AliasSource.SALES },
      { alias: "TTS Mega Markazi", source: AliasSource.VISITS },
    ],
  },
  {
    name: "Oila SM",
    sortOrder: 2,
    aliases: [
      { alias: "Маркет OILA market", source: AliasSource.SALES },
      { alias: "Oila", source: AliasSource.VISITS },
    ],
  },
  {
    name: "Gold Mart",
    sortOrder: 3,
    aliases: [
      { alias: "Маркет GoldMart", source: AliasSource.SALES },
      { alias: "Goldmart", source: AliasSource.VISITS },
    ],
  },
  {
    name: "Smart City",
    sortOrder: 4,
    aliases: [
      { alias: "Маркет Uchquduq SmartCity", source: AliasSource.SALES },
      { alias: "Smart City", source: AliasSource.VISITS },
    ],
  },
];

const GROUPS = [
  { name: "FRESH",    sortOrder: 1 },
  { name: "FOOD",     sortOrder: 2 },
  { name: "NON-FOOD", sortOrder: 3 },
];

// name = DB ga yoziladigan kanonik nom, sortOrder > 0 = analitikada ko'rinadi
const CATEGORIES: { name: string; groupName: string; sortOrder: number }[] = [
  { name: "MOLOCHKA",            groupName: "FRESH",    sortOrder: 1  },
  { name: "MYASNOY",             groupName: "FRESH",    sortOrder: 2  },
  { name: "OVOSH I FRUKTI",      groupName: "FRESH",    sortOrder: 3  },
  { name: "KOLBASNIY",           groupName: "FRESH",    sortOrder: 4  },
  { name: "TUXUM",               groupName: "FRESH",    sortOrder: 5  },
  { name: "TAYYOR MAHSULOT",     groupName: "FRESH",    sortOrder: 6  },
  { name: "XLEB I KONDITERSKIY", groupName: "FRESH",    sortOrder: 7  },
  { name: "BAKALEYA",            groupName: "FOOD",     sortOrder: 8  },
  { name: "KOFE I CHAY",         groupName: "FOOD",     sortOrder: 9  },
  { name: "SHIRINLIKLAR",        groupName: "FOOD",     sortOrder: 10 },
  { name: "SNACK&QURUQ MEVALAR", groupName: "FOOD",     sortOrder: 11 },
  { name: "SOK I NAPITKI",       groupName: "FOOD",     sortOrder: 12 },
  { name: "ZAMOROZKA",           groupName: "FOOD",     sortOrder: 13 },
  { name: "DETSOE PITANIE",      groupName: "FOOD",     sortOrder: 14 },
  { name: "CHISTYASHIE SREDSTO", groupName: "NON-FOOD", sortOrder: 15 },
  { name: "DETSKIY",             groupName: "NON-FOOD", sortOrder: 16 },
  { name: "IGRUSHKI",            groupName: "NON-FOOD", sortOrder: 17 },
  { name: "KONSTOVAR",           groupName: "NON-FOOD", sortOrder: 18 },
  { name: "PARFYUMERIYA",        groupName: "NON-FOOD", sortOrder: 19 },
  { name: "XOZ TOVAR",           groupName: "NON-FOOD", sortOrder: 20 },
  { name: "ZOOTOVAR",            groupName: "NON-FOOD", sortOrder: 21 },
];

async function main() {
  console.log("→ Seeding branches...");
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { name: b.name },
      update: { sortOrder: b.sortOrder },
      create: { name: b.name, sortOrder: b.sortOrder },
    });
    for (const a of b.aliases) {
      await prisma.branchAlias.upsert({
        where: { alias_source: { alias: a.alias, source: a.source } },
        update: { branchId: branch.id },
        create: { branchId: branch.id, alias: a.alias, source: a.source },
      });
    }
  }

  console.log("→ Seeding category groups...");
  const groupMap = new Map<string, number>();
  for (const g of GROUPS) {
    const group = await prisma.categoryGroup.upsert({
      where: { name: g.name },
      update: { sortOrder: g.sortOrder },
      create: { name: g.name, sortOrder: g.sortOrder },
    });
    groupMap.set(g.name, group.id);
  }

  console.log("→ Seeding categories...");
  for (const cat of CATEGORIES) {
    const groupId = groupMap.get(cat.groupName)!;
    await prisma.category.upsert({
      where: { name: cat.name },
      update: { sortOrder: cat.sortOrder, groupId },
      create: { name: cat.name, sortOrder: cat.sortOrder, groupId },
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!adminEmail || !adminPassword) {
    console.log(
      "⚠ SEED_ADMIN_EMAIL yoki SEED_ADMIN_PASSWORD env o'zgaruvchisi yo'q — admin yaratilmadi."
    );
    return;
  }

  console.log(`→ Seeding admin user (${adminEmail})...`);
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log("✓ Seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
