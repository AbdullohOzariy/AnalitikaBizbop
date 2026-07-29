/**
 * Mavjud so'rovlarni KANONIK reyestr bo'yicha qayta qurish.
 *
 *   railway run npx tsx scripts/community-kanon-backfill.ts 7      # oxirgi 7 kun
 *   railway run npx tsx scripts/community-kanon-backfill.ts 2026-07-27 2026-07-29
 *
 * IDEMPOTENT: qayta ishga tushirilsa oynalar `inputHash`+`promptVersion` bo'yicha
 * o'tkazib yuboriladi, faqat PENDING so'rovlar moslashtiriladi.
 * Oxirida reyestr va ehtimoliy dublikatlar ko'z bilan tekshirish uchun chiqariladi.
 */
import "dotenv/config";
import { analizQil } from "../src/lib/community/analiz";
import { moslashtir } from "../src/lib/community/match";
import { ehtimoliyDublikatlar } from "../src/lib/community/kanon";
import { tahlilChatId, getCommunityConfig } from "../src/lib/community/sozlama";
import { prisma } from "../src/lib/prisma";
import { isoDay, nowTashkent } from "../src/lib/date";

const args = process.argv.slice(2);
const sanalar = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const kunSoni = Number(args.find((a) => /^\d{1,3}$/.test(a)) ?? 7);

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
  if (!cfg.apiKey) throw new Error("GEMINI_API_KEY sozlanmagan.");
  const chatId = await tahlilChatId();
  if (chatId == null) throw new Error("Guruh topilmadi.");

  const kunlar =
    sanalar.length >= 2
      ? oraliq(sanalar[0], sanalar[1])
      : sanalar.length === 1
        ? sanalar
        : Array.from({ length: kunSoni }, (_, i) =>
            isoDay(new Date(nowTashkent().getTime() - i * 86_400_000))
          ).reverse();

  console.log(`Guruh: ${chatId} | kunlar: ${kunlar.length} (${kunlar[0]} … ${kunlar[kunlar.length - 1]})\n`);

  for (const day of kunlar) {
    const r = await analizQil({ chatId, dayKey: day, onProgress: (m) => console.log(`  ${m}`) });
    if (r.windows === 0) continue;
    const m = await moslashtir({ dayKey: day, onProgress: (x) => console.log(`  ${x}`) });
    console.log(
      `${day}: ${r.windows} oyna (${r.skipped} o'tkazildi) → ${r.requests} so'rov | ` +
        `kanon: ${m.kanon} (yangi ${m.yangiKanon}), kategoriya: ${m.categorized}, mos yo'q: ${m.none}`
    );
  }

  const kanonlar = await prisma.tgCanonProduct.findMany({
    where: { mergedIntoId: null },
    select: { id: true, name: true, hits: true, category: { select: { name: true } } },
    orderBy: { hits: "desc" },
    take: 60,
  });
  console.log(`\n=== KANON REYESTRI (${kanonlar.length} ta, eng ko'p uchraganlar) ===`);
  for (const k of kanonlar) {
    console.log(`  ${String(k.hits).padStart(3)}x  ${k.name.padEnd(28)} ${k.category?.name ?? "—"}`);
  }

  const dub = await ehtimoliyDublikatlar();
  if (dub.length) {
    console.log(`\n=== EHTIMOLIY DUBLIKATLAR (${dub.length}) — ko'zdan kechiring ===`);
    for (const d of dub) {
      console.log(`  ${d.sim.toFixed(2)}  #${d.aId} ${d.aName}  ↔  #${d.bId} ${d.bName}`);
    }
  } else {
    console.log("\nEhtimoliy dublikat topilmadi.");
  }
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
