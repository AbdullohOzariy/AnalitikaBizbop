/**
 * Telegram Desktop eksportini `TgGroupMessage` ga yuklaydi (idempotent).
 * JSON ham, HTML ham qo'llab-quvvatlanadi — kengaytmaga qarab aniqlanadi.
 *
 *   npx tsx scripts/tg-group-import.ts ~/Downloads/result.json
 *   npx tsx scripts/tg-group-import.ts "~/Desktop/27.07(CHAT)/messages.html"
 *   npx tsx scripts/tg-group-import.ts result.json --from 2026-07-27   # sanadan boshlab
 *   npx tsx scripts/tg-group-import.ts result.json --dry               # yozmasdan ko'rish
 *
 * DIQQAT: HTML eksportida foydalanuvchi ID YO'Q (faqat ism) — `fromId` null bo'ladi.
 * JSON afzal. HTML uchun guruh ID bazadan olinadi (yoki --chat bilan beriladi).
 *
 * Qayta ishga tushirish xavfsiz: (chatId, messageId) unikal — dublikat o'tkazib yuboriladi.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseExport } from "../src/lib/tg-group/import";
import { parseHtmlExport } from "../src/lib/tg-group/import-html";

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

/** HTML uchun guruh ID: --chat yoki bazadagi birinchi faol guruh. */
async function htmlChatId(): Promise<bigint> {
  const idx = args.indexOf("--chat");
  const raw = idx >= 0 ? args[idx + 1] : "";
  if (/^-?\d+$/.test(raw)) return BigInt(raw);
  const g = await prisma.tgGroup.findFirst({
    where: { active: true },
    orderBy: { joinedAt: "asc" },
    select: { chatId: true, title: true },
  });
  if (!g) throw new Error("Guruh topilmadi — --chat <chatId> bilan bering.");
  console.log(`Guruh bazadan: ${g.title ?? "(nomsiz)"} (${g.chatId})`);
  return g.chatId;
}

async function main() {
  const raw = readFileSync(file!, "utf8");
  const isHtml = /\.html?$/i.test(file!) || raw.trimStart().startsWith("<!DOCTYPE html");

  let chatId: bigint;
  let title: string | null;
  let messages: ReturnType<typeof parseExport>["messages"];
  let skipped: { service?: number; noId?: number; noDate: number; empty: number };

  if (isHtml) {
    chatId = await htmlChatId();
    const r = parseHtmlExport(raw, chatId);
    messages = r.messages;
    skipped = r.skipped;
    title = null;
    console.log("Manba: HTML (fromId YO'Q — operator ISM bo'yicha aniqlanadi)");
    console.log(
      "Mualliflar: " +
        [...r.names.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([n, c]) => `${n}(${c})`)
          .join(", ")
    );
  } else {
    const parsed = parseExport(JSON.parse(raw));
    chatId = parsed.chatId;
    title = parsed.title;
    messages = parsed.messages;
    skipped = parsed.skipped;
  }

  const rows = fromDay ? messages.filter((m) => m.dayKey >= fromDay) : messages;

  console.log(`Guruh: ${title ?? "(nomsiz)"}  chatId=${chatId}`);
  console.log(
    `Xabarlar: ${messages.length} ta o'qildi` +
      (fromDay ? ` → ${rows.length} ta (${fromDay} dan boshlab)` : "") +
      `  | tashlab ketildi: service=${skipped.service ?? 0} bo'sh=${skipped.empty} sanasiz=${skipped.noDate}`,
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
