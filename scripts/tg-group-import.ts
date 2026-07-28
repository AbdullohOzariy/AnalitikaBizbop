/**
 * Telegram Desktop JSON eksportini `TgGroupMessage` ga yuklaydi (idempotent).
 *
 *   npx tsx scripts/tg-group-import.ts ~/Downloads/result.json
 *   npx tsx scripts/tg-group-import.ts result.json --from 2026-07-27   # sanadan boshlab
 *   npx tsx scripts/tg-group-import.ts result.json --dry               # yozmasdan ko'rish
 *
 * Qayta ishga tushirish xavfsiz: (chatId, messageId) unikal — dublikat o'tkazib yuboriladi.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseExport } from "../src/lib/tg-group/import";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry");
const fromIdx = args.indexOf("--from");
const fromDay = fromIdx >= 0 ? args[fromIdx + 1] : null;

if (!file) {
  console.error("Foydalanish: npx tsx scripts/tg-group-import.ts <export.json> [--from YYYY-MM-DD] [--dry]");
  process.exit(1);
}
if (fromDay && !/^\d{4}-\d{2}-\d{2}$/.test(fromDay)) {
  console.error(`--from noto'g'ri: "${fromDay}" (kutilgan YYYY-MM-DD)`);
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const root = JSON.parse(readFileSync(file!, "utf8"));
  const { chatId, title, messages, skipped } = parseExport(root);

  const rows = fromDay ? messages.filter((m) => m.dayKey >= fromDay) : messages;

  console.log(`Guruh: ${title ?? "(nomsiz)"}  chatId=${chatId}`);
  console.log(
    `Xabarlar: ${messages.length} ta o'qildi` +
      (fromDay ? ` → ${rows.length} ta (${fromDay} dan boshlab)` : "") +
      `  | tashlab ketildi: service=${skipped.service} bo'sh=${skipped.empty} sanasiz=${skipped.noDate}`,
  );
  if (rows.length) {
    const days = [...new Set(rows.map((m) => m.dayKey))].sort();
    console.log(`Kunlar: ${days[0]} … ${days[days.length - 1]} (${days.length} kun)`);
    console.log(`Muallif: ${new Set(rows.map((m) => m.fromName ?? "?")).size} ta`);
  }

  if (dry) {
    console.log("\n--dry: DB'ga yozilmadi. Namuna (5 ta):");
    for (const m of rows.slice(0, 5)) {
      console.log(`  [${m.dayKey}] ${m.fromName}: ${m.text.slice(0, 90).replace(/\n/g, " ⏎ ")}`);
    }
    return;
  }

  await prisma.tgGroup.upsert({
    where: { chatId },
    create: { chatId, title },
    update: title ? { title } : {},
  });

  let written = 0;
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.tgGroupMessage.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    written += res.count;
  }
  console.log(`\nYozildi: ${written} ta yangi (${rows.length - written} ta allaqachon bor edi).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
