/**
 * PROGNOZ TO'SIQ HISOBOTI — model naive baseline'dan yaxshiroqmi.
 *
 *   railway run npx tsx scripts/prognoz-backtest.ts
 *   railway run npx tsx scripts/prognoz-backtest.ts --stockout-qoldir
 *
 * DB'ga HECH NARSA YOZMAYDI — faqat o'qiydi va konsolga jadval chiqaradi.
 *
 * Bu Faza 1 ning yakuni: qaysi segmentda model qurish mumkinligini RAQAM bilan
 * ko'rsatadi. FVA manfiy chiqsa — o'sha sinfda model qurish kerak emas.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WEEKLY_PANEL_SQL, type PanelCell, type Sinf } from "../src/lib/prognoz/panel";
import { backtest } from "../src/lib/prognoz/backtest";
import { wape, bias, fvaRel, fvaPp, baseWape, add, EMPTY } from "../src/lib/prognoz/metrics";
import type { ModelKey } from "../src/lib/prognoz/model";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const stockoutQoldir = process.argv.includes("--stockout-qoldir");

const pc = (v: number | null, xona = 1) => (v == null ? "  —  " : (v * 100).toFixed(xona) + "%");
const SINFLAR: Sinf[] = ["SMOOTH", "ERRATIC", "INTERMITTENT", "LUMPY"];

async function main() {
  console.log("Haftalik panel o'qilmoqda…");
  const t0 = Date.now();
  const cells = await prisma.$queryRawUnsafe<PanelCell[]>(WEEKLY_PANEL_SQL);
  console.log(`  ${cells.length.toLocaleString("ru-RU")} katak, ${Date.now() - t0} ms\n`);

  const r = backtest(cells, {
    horizons: [1, 4],
    models: ["naive1", "ma4", "ma8", "combo50"],
    stockoutChiqar: !stockoutQoldir,
  });

  console.log(
    `Seriyalar: ${r.seriyalar.toLocaleString("ru-RU")} | test kataklari: ${r.kataklar.toLocaleString("ru-RU")} | ` +
      `origin'lar: ${r.origins.join(", ")} | stockout: ${stockoutQoldir ? "QOLDIRILDI" : "chiqarildi"}\n`
  );

  // ── Sinf tarkibi: seriya soni va so'mli ulush ──
  const jamiSom = [...r.sinfStat.values()].reduce((s, v) => s + v.som, 0);
  const jamiSer = [...r.sinfStat.values()].reduce((s, v) => s + v.seriya, 0);
  console.log("SINF TARKIBI (seriya % / savdo %):");
  for (const s of [...SINFLAR, "KAM" as Sinf]) {
    const st = r.sinfStat.get(s);
    if (!st) continue;
    console.log(
      `  ${s.padEnd(13)} ${String(st.seriya).padStart(6)} ta  ` +
        `${((st.seriya / jamiSer) * 100).toFixed(1).padStart(5)}% seriya  ` +
        `${((st.som / jamiSom) * 100).toFixed(1).padStart(5)}% savdo`
    );
  }

  // ── Model × gorizont: WAPE va FVA ──
  for (const h of [1, 4]) {
    console.log(`\n═══ GORIZONT ${h} HAFTA ═══`);
    console.log(
      "  MODEL".padEnd(12) +
        "SINF".padEnd(14) +
        "WAPE".padStart(8) +
        "naive".padStart(8) +
        "FVA".padStart(9) +
        "FVA pp".padStart(9) +
        "BIAS".padStart(9)
    );
    for (const m of ["naive1", "ma4", "ma8", "combo50"] as ModelKey[]) {
      const bySinf = r.byModel.get(m)!.get(h)!;
      let jami = EMPTY;
      for (const s of SINFLAR) {
        const a = bySinf.get(s);
        if (!a) continue;
        jami = add(jami, a);
        console.log(
          `  ${m.padEnd(10)}${s.padEnd(14)}${pc(wape(a)).padStart(8)}${pc(baseWape(a)).padStart(8)}` +
            `${pc(fvaRel(a)).padStart(9)}${pc(fvaPp(a)).padStart(9)}${pc(bias(a)).padStart(9)}`
        );
      }
      console.log(
        `  ${"".padEnd(10)}${"JAMI".padEnd(14)}${pc(wape(jami)).padStart(8)}${pc(baseWape(jami)).padStart(8)}` +
          `${pc(fvaRel(jami)).padStart(9)}${pc(fvaPp(jami)).padStart(9)}${pc(bias(jami)).padStart(9)}`
      );
      console.log("  " + "─".repeat(66));
    }
  }

  // ── Xulosa: qaysi model g'olib ──
  console.log("\n═══ XULOSA ═══");
  for (const h of [1, 4]) {
    const nat = (["naive1", "ma4", "ma8", "combo50"] as ModelKey[]).map((m) => {
      let jami = EMPTY;
      for (const s of SINFLAR) {
        const a = r.byModel.get(m)!.get(h)!.get(s);
        if (a) jami = add(jami, a);
      }
      return { m, w: wape(jami), fva: fvaRel(jami) };
    });
    const golib = nat.filter((x) => x.w != null).sort((a, b) => a.w! - b.w!)[0];
    console.log(
      `  h=${h}: g'olib ${golib.m} (WAPE ${pc(golib.w)}), FVA ${pc(golib.fva)} — ` +
        (golib.m === "naive1"
          ? "MODEL QIYMAT QO'SHMADI (naive g'olib)"
          : (golib.fva ?? 0) >= 0.02
            ? "model qiymat qo'shdi (gate o'tdi)"
            : "FVA 2% dan past — shovqin, gate o'tmadi")
    );
  }
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
