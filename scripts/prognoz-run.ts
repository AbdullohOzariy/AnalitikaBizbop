/**
 * HAFTALIK PROGNOZNI QO'LDA ISHGA TUSHIRISH (cron bilan AYNI kod yo'li).
 *
 *   railway run npx tsx scripts/prognoz-run.ts --dry       # DB'ga yozmaydi, faqat ko'rsatadi
 *   railway run npx tsx scripts/prognoz-run.ts             # yozadi (idempotent)
 *   railway run npx tsx scripts/prognoz-run.ts --force     # joriy haftani qayta hisoblaydi
 *   railway run npx tsx scripts/prognoz-run.ts --backfill  # o'tgan origin'lar + darhol baho
 */
import "dotenv/config";
import { backfill, prognozQuruq, prognozYugur } from "../src/lib/prognoz/hisobla";
import { pgPool, prisma } from "../src/lib/prisma";

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");
const bf = process.argv.includes("--backfill");

const n = (v: number) => v.toLocaleString("ru-RU");

async function main() {
  const t0 = Date.now();

  if (dry) {
    const r = await prognozQuruq();
    console.log(`origin: ${r.origin} | panelda ${r.panelWeeks} to'liq hafta | kechikish ${r.kechikish} hafta`);
    console.log(`seriyalar: ${n(r.seriesTotal)} → prognoz ${n(r.forecasted)} (KAM ${n(r.skippedKam)}, arxiv ${n(r.skippedArch)})`);
    console.log("sinf tarkibi:", r.sinfStat);
    console.log("\nnamuna (5 qator):");
    for (const y of r.namuna) {
      console.log(
        `  SKU ${y.productId} f${y.branchId} ${String(y.sinf).padEnd(13)} ${String(y.modelKey).padEnd(8)} ` +
          `p50 ${Number(y.p50).toFixed(1).padStart(8)}  q90 ${Number(y.q90).toFixed(1).padStart(8)}  ` +
          `naive ${Number(y.baseline).toFixed(1).padStart(8)}  o'tgan hafta ${Number(y.lastQty).toFixed(1)}`
      );
    }
    console.log(`\n${Date.now() - t0} ms — DB'ga hech narsa yozilmadi`);
    return;
  }

  if (bf) {
    const rs = await backfill({ force });
    const oxirgi = rs[rs.length - 1];
    console.log(`\n${rs.length} ta origin qamrandi (${rs[0]?.origin} … ${oxirgi?.origin})`);
    console.log(`baho: ${oxirgi?.baholanganRun} run / ${n(oxirgi?.baholanganQator ?? 0)} qator`);
    console.log(`\n${Date.now() - t0} ms`);
    return;
  }

  const r = await prognozYugur({ force });
  console.log(`origin: ${r.origin} | panelda ${r.panelWeeks} to'liq hafta | kechikish ${r.kechikish} hafta`);
  console.log(
    r.yangi
      ? `prognoz: ${n(r.forecasted)} seriya (KAM ${n(r.skippedKam)}, arxiv ${n(r.skippedArch)})`
      : `prognoz: shu hafta allaqachon hisoblangan (${n(r.forecasted)} qator) — o'tkazib yuborildi`
  );
  console.log(`baho: ${r.baholanganRun} run / ${n(r.baholanganQator)} qator`);
  console.log(`tozalandi: prognoz ${n(r.tozalandi.prognoz)}, aniqlik ${n(r.tozalandi.aniqlik)}`);
  console.log(`\n${Date.now() - t0} ms`);
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  // `pgPool.end()` SHART: pool `idleTimeoutMillis: 600_000` + `keepAlive` bilan ishlaydi,
  // ya'ni faqat `prisma.$disconnect()` chaqirilsa jarayon ish tugagach ham 10 daqiqa
  // "tirik" turadi (skript qotib qolgandek ko'rinadi).
  .finally(async () => {
    await prisma.$disconnect();
    await pgPool.end();
  });
