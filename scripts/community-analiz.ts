/**
 * Kunni (yoki sana oralig'ini) AI bilan tahlil qiladi va natijani DB'ga yozadi.
 *
 *   railway run npx tsx scripts/community-analiz.ts 2026-07-28
 *   railway run npx tsx scripts/community-analiz.ts 2026-07-26 2026-07-28
 *   railway run npx tsx scripts/community-analiz.ts 2026-07-28 --force   # keshni e'tiborsiz qoldirish
 *
 * Idempotent: o'zgarmagan oynalar Gemini'ga QAYTA yuborilmaydi.
 */
import "dotenv/config";
import { analizQil } from "../src/lib/community/analiz";
import { tahlilChatId, getCommunityConfig } from "../src/lib/community/sozlama";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
const kunlar = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const force = args.includes("--force");

if (kunlar.length === 0) {
  console.error("Foydalanish: npx tsx scripts/community-analiz.ts YYYY-MM-DD [YYYY-MM-DD] [--force]");
  process.exit(1);
}

function oraliq(a: string, b: string): string[] {
  const out: string[] = [];
  const d = new Date(a + "T00:00:00Z");
  const end = new Date(b + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function main() {
  const cfg = await getCommunityConfig();
  if (!cfg.apiKey) throw new Error("GEMINI_API_KEY (yoki COMMUNITY_AI_KEY) sozlanmagan.");
  if (cfg.operatorIds.length === 0) {
    console.warn(
      "⚠️  Operator ID sozlanmagan (COMMUNITY_OPERATOR_IDS) — hamma MIJOZ deb hisoblanadi,\n" +
        "   ya'ni 'javob berildimi' mantig'i ishlamaydi. Avval sozlang.\n"
    );
  }

  const chatId = await tahlilChatId();
  if (chatId == null) throw new Error("Tahlil qilinadigan guruh topilmadi (TgGroup bo'sh).");

  const royxat = kunlar.length >= 2 ? oraliq(kunlar[0], kunlar[1]) : kunlar;
  console.log(`Guruh: ${chatId} | model: ${cfg.model ?? "(default)"} | kunlar: ${royxat.length}\n`);

  let jamiReq = 0,
    jamiIn = 0,
    jamiOut = 0;
  for (const day of royxat) {
    const r = await analizQil({
      chatId,
      dayKey: day,
      force,
      onProgress: (m) => console.log(`  ${m}`),
    });
    console.log(
      `${day}: ${r.windows} oyna (${r.skipped} o'tkazildi) → ${r.requests} so'rov` +
        (r.errors ? `, ${r.errors} XATO` : "") +
        ` | ${r.inTokens}+${r.outTokens} token`
    );
    jamiReq += r.requests;
    jamiIn += r.inTokens;
    jamiOut += r.outTokens;
  }

  console.log(`\nJami: ${jamiReq} so'rov | tokenlar: ${jamiIn} in / ${jamiOut} out`);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
