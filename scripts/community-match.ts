/**
 * So'rovlarni KANONIK mahsulot va subkategoriyaga bog'laydi (PENDING bo'lganlarini).
 *
 *   railway run npx tsx scripts/community-match.ts
 *   railway run npx tsx scripts/community-match.ts 2026-07-28
 */
import "dotenv/config";
import { moslashtir } from "../src/lib/community/match";
import { prisma } from "../src/lib/prisma";

const day = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

async function main() {
  const r = await moslashtir({ dayKey: day, onProgress: (m) => console.log(`  ${m}`) });
  console.log(
    `\nJami: ${r.total} | kalitdan: ${r.fromCache} | kanon: ${r.kanon} (yangi ${r.yangiKanon}) | ` +
      `kategoriya: ${r.categorized} | mos yo'q: ${r.none}` +
      (r.errors ? ` | XATO: ${r.errors}` : "") +
      `\nTokenlar: ${r.inTokens} in / ${r.outTokens} out`
  );
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
