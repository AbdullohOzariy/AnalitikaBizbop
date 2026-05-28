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

const CATEGORIES = [
  "BAKALEYA",
  "CHISTYASHIE SREDSTVI",
  "DETSKIY",
  "IGRUSHKI",
  "KASSA",
  "KOFE I CHAY",
  "KOLBASNIY",
  "KONFETI I SHOKOLAD",
  "KONSTOVARI",
  "MOLOCHKA",
  "MYASNOY",
  "OVOSHI I FRUKTI",
  "PARFUMERIYA",
  "SNEKI",
  "SOKI I NAPITKI",
  "SUXIE FRUKTI",
  "XLEB I KONDITERSKIY",
  "XOZ TOVARI",
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

  console.log("→ Seeding categories...");
  for (let i = 0; i < CATEGORIES.length; i++) {
    await prisma.category.upsert({
      where: { name: CATEGORIES[i] },
      update: { sortOrder: i + 1 },
      create: { name: CATEGORIES[i], sortOrder: i + 1 },
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
