/**
 * PROGNOZ SIFATI HISOBOTI — `SkuForecastSegment` agregatlaridan o'qiydi.
 *
 *   railway run npx tsx scripts/prognoz-sifat.ts
 *
 * DB'ga yozmaydi. UI (Faza 4) shu jadvalning AYNI o'zini o'qiydi — hisobot konsolda
 * ishlaydi, ya'ni raqamlar UI'dan oldin ham tekshirilib turadi.
 *
 * O'QISH QOIDASI: WAPE/BIAS/FVA yig'indilardan HISOBLANADI, saqlanmaydi. Shu sabab
 * har qanday kesimni (filial, kategoriya, ABC, sinf) qo'shib o'qish mumkin va natija
 * umumiy raqam bilan ziddiyatga tushmaydi.
 */
import "dotenv/config";
import { pgPool } from "../src/lib/prisma";

const pc = (v: number | null, x = 1) => (v == null ? "   —  " : (v * 100).toFixed(x) + "%");

interface Qator {
  nom: string;
  seriya: number;
  n: number;
  actual: number;
  forecast: number;
  abserr: number;
  baseabserr: number;
  ishonchli: number;
  taxminiy: number;
  ishonchsiz: number;
  qopladi: number;
  ortiqcha: number;
  kamomad: number;
}

const SARLAVHA =
  "  " +
  "NOM".padEnd(22) +
  "seriya".padStart(8) +
  "WAPE".padStart(8) +
  "naive".padStart(8) +
  "FVA".padStart(8) +
  "BIAS".padStart(8) +
  "servis".padStart(8) +
  "ortiq".padStart(7) +
  "kam".padStart(6) +
  "  ishonch (I/T/S)";

function chiqar(rows: Qator[]) {
  for (const r of rows) {
    const a = Number(r.actual);
    const ae = Number(r.abserr);
    const be = Number(r.baseabserr);
    const n = Number(r.n) || 1;
    const jamiIshonch = Number(r.ishonchli) + Number(r.taxminiy) + Number(r.ishonchsiz);
    const ul = (v: number) => (jamiIshonch > 0 ? ((Number(v) / jamiIshonch) * 100).toFixed(0) : "—");
    console.log(
      "  " +
        String(r.nom).slice(0, 22).padEnd(22) +
        Number(r.seriya).toLocaleString("ru-RU").padStart(8) +
        pc(a > 0 ? ae / a : null).padStart(8) +
        pc(a > 0 ? be / a : null).padStart(8) +
        pc(be > 0 ? 1 - ae / be : null).padStart(8) +
        pc(a > 0 ? (Number(r.forecast) - a) / a : null).padStart(8) +
        pc(Number(r.qopladi) / n).padStart(8) +
        (Number(r.ortiqcha) / n).toFixed(1).padStart(7) +
        (Number(r.kamomad) / n).toFixed(1).padStart(6) +
        `  ${ul(r.ishonchli)}/${ul(r.taxminiy)}/${ul(r.ishonchsiz)}`
    );
  }
}

const USTUNLAR = `sum(seriya)::int seriya, sum(n)::int n, sum(actual) actual, sum(forecast) forecast,
   sum("absErr") abserr, sum("baseAbsErr") baseabserr, sum(ishonchli)::int ishonchli,
   sum(taxminiy)::int taxminiy, sum(ishonchsiz)::int ishonchsiz, sum(qopladi)::int qopladi,
   sum(ortiqcha) ortiqcha, sum(kamomad) kamomad`;

async function kesim(nom: string, scope: string, tartib = "sum(actual) DESC") {
  const r = await pgPool.query<Qator>(
    `SELECT coalesce(label, key) nom, ${USTUNLAR}
     FROM "SkuForecastSegment" WHERE scope = $1 GROUP BY 1 ORDER BY ${tartib}`,
    [scope]
  );
  if (r.rows.length === 0) return;
  console.log(`\n── ${nom}`);
  chiqar(r.rows);
}

async function main() {
  const meta = await pgPool.query<{
    runs: number; baholangan: number; oyna: string; oxirgi: string; biask: number; servis: number;
  }>(`
    SELECT count(*)::int runs,
           count(*) FILTER (WHERE "scoredAt" IS NOT NULL)::int baholangan,
           min("weekStart")::text oyna, max("weekStart")::text oxirgi,
           (SELECT "biasK" FROM "SkuForecastRun" ORDER BY "weekStart" DESC LIMIT 1) biask,
           (SELECT servis FROM "SkuForecastRun" ORDER BY "weekStart" DESC LIMIT 1) servis
    FROM "SkuForecastRun"`);
  const m = meta.rows[0];
  if (!m || m.runs === 0) {
    console.log("Hali prognoz yugurishi yo'q. `scripts/prognoz-run.ts` ni ishlating.");
    return;
  }
  console.log(
    `${m.runs} yugurish (${m.oyna} … ${m.oxirgi}), ${m.baholangan} tasi baholangan · ` +
      `oxirgi BIAS k = ${Number(m.biask).toFixed(4)} · maqsad servis ${(Number(m.servis) * 100).toFixed(0)}%`
  );

  const kal = await pgPool.query<{ sinf: string; quantc: number; n: number; sovuq: boolean }>(`
    SELECT c.sinf, c."quantC" quantc, c.n, c.sovuq FROM "SkuForecastCalib" c
    WHERE c."runId" = (SELECT id FROM "SkuForecastRun" ORDER BY "weekStart" DESC LIMIT 1)
    ORDER BY c.sinf`);
  if (kal.rows.length > 0) {
    console.log(
      "oxirgi kvantil c: " +
        kal.rows
          .filter((x) => x.sinf !== "KAM")
          .map((x) => `${x.sinf} ${Number(x.quantc).toFixed(2)}${x.sovuq ? " (sovuq)" : ""}`)
          .join(" · ")
    );
  }

  console.log(
    "\nSERVIS iqtisodi: `servis` — q90 faktni qoplagan oynalar ulushi (maqsad 90%);\n" +
      "`ortiq`/`kam` — seriya-oynasiga o'rtacha ortiqcha zaxira va yo'qotilgan sotuv (dona).\n" +
      "Ishonch (I/T/S) — oxirgi 4 oyna WAPE'i bo'yicha: ≤30% / 30–60% / >60%."
  );
  console.log("\n" + SARLAVHA);
  await kesim("JAMI", "ALL");
  await kesim("SINF", "SINF");
  await kesim("FILIAL", "BRANCH");
  await kesim("ABC", "ABC", "nom");

  // Oyna bo'yicha trend — sifat yaxshilanyaptimi yoki yomonlashyaptimi
  const trend = await pgPool.query<Qator>(`
    SELECT r."weekStart"::text nom, s.seriya, s.n, s.actual, s.forecast, s."absErr" abserr,
           s."baseAbsErr" baseabserr, s.ishonchli, s.taxminiy, s.ishonchsiz,
           s.qopladi, s.ortiqcha, s.kamomad
    FROM "SkuForecastSegment" s JOIN "SkuForecastRun" r ON r.id = s."runId"
    WHERE s.scope = 'ALL' ORDER BY r."weekStart" DESC LIMIT 8`);
  if (trend.rows.length > 0) {
    console.log("\n── OYNA bo'yicha (oxirgi 8, origin sanasi)");
    chiqar(trend.rows);
  }

  const kat = await pgPool.query<Qator>(
    `SELECT coalesce(label, key) nom, ${USTUNLAR}
     FROM "SkuForecastSegment" WHERE scope = 'KAT' GROUP BY 1
     ORDER BY sum("absErr") DESC LIMIT 10`
  );
  if (kat.rows.length > 0) {
    console.log("\n── KATEGORIYA (xato hissasi eng katta 10 ta)");
    chiqar(kat.rows);
  }
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => pgPool.end());
