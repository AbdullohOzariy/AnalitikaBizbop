/**
 * FAZA 3 O'LCHOVI — kalibratsiya raqamlarini bazadagi HAQIQIY bahodan chiqaradi.
 *
 *   railway run npx tsx scripts/prognoz-kalib.ts
 *
 * DB'ga HECH NARSA YOZMAYDI. Ikki savolga raqam bilan javob beradi:
 *
 *   1. BIAS +7.4% ni tuzatish WAPE'ni yaxshilaydimi? (tuzatish BIAS'ni ta'rifi bo'yicha
 *      kamaytiradi — savol shundaki, aniqlik ham yaxshilanadimi yoki faqat ko'rsatkich
 *      chiroyli bo'ladimi). Tuzatish koeffitsienti FAQAT O'TGAN oynalardan olinadi —
 *      aks holda o'lchov o'zini o'zi tasdiqlab qo'yardi.
 *   2. q90 uchun EMPIRIK kvantil formuladan yaxshiroqmi? Teng qoplashda qaysi biri kam
 *      ortiqcha zaxira talab qiladi.
 */
import "dotenv/config";
import { pgPool } from "../src/lib/prisma";
import { add, bias, fvaRel, wape, scoreCell, EMPTY, type ErrAcc } from "../src/lib/prognoz/metrics";

interface Qator {
  tt: string; // targetTo (oyna kaliti)
  sinf: string;
  abc: string | null;
  actual: number;
  forecast: number; // p50
  baseline: number;
  q90: number;
  unitPrice: number;
}

const pc = (v: number | null, x = 1) => (v == null ? "  —  " : (v * 100).toFixed(x) + "%");
const SINFLAR = ["SMOOTH", "ERRATIC", "INTERMITTENT", "LUMPY"];

/** Kvantil (chiziqli interpolyatsiyasiz — pastki qiymat; ehtiyotkor tomon). */
function kvantil(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

function guruhla<T>(rows: T[], kalit: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = kalit(r);
    const a = m.get(k);
    if (a) a.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** BIAS tuzatish koeffitsienti: F' = F / k, k = ΣF / ΣA (o'tgan oynalardan). */
function koeff(acc: ErrAcc): number | null {
  return acc.actual > 0 && acc.forecast > 0 ? acc.forecast / acc.actual : null;
}

/** Shrinkage: kichik namunada tuzatishni 1 ga tortadi (n → og'irlik). */
const SHRINK_N = 2_000;
function siqilgan(k: number | null, n: number): number {
  if (k == null) return 1;
  const w = n / (n + SHRINK_N);
  return 1 + w * (k - 1);
}

/** Xavfsizlik chegarasi — kalibratsiya modelni buzib yubormasin. */
const K_MIN = 0.75;
const K_MAX = 1.35;
const qisqart = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));

async function main() {
  const t0 = Date.now();
  const r = await pgPool.query<Qator>(`
    SELECT a."targetTo"::text tt, a.sinf, p."abcClass" abc,
           a.actual, a.forecast, a.baseline, f.q90,
           CASE WHEN a.actual > 0 THEN a."amountWeight" / a.actual ELSE 0 END "unitPrice"
    FROM "SkuForecastAccuracy" a
    JOIN "SkuForecast" f
      ON f."runId" = a."runId" AND f."productId" = a."productId" AND f."branchId" = a."branchId"
    JOIN "Product" p ON p.id = a."productId"
    WHERE a.stockout = false
  `);
  const rows = r.rows.map((x) => ({
    ...x,
    actual: Number(x.actual),
    forecast: Number(x.forecast),
    baseline: Number(x.baseline),
    q90: Number(x.q90),
    unitPrice: Number(x.unitPrice),
  }));
  const oynalar = [...new Set(rows.map((x) => x.tt))].sort();
  console.log(
    `${rows.length.toLocaleString("ru-RU")} baho qatori, ${oynalar.length} oyna ` +
      `(${oynalar[0]} … ${oynalar[oynalar.length - 1]}), ${Date.now() - t0} ms\n`
  );

  // ── 1. HOZIRGI HOLAT ──────────────────────────────────────────────────────────
  console.log("═══ 1. HOZIRGI HOLAT (kalibratsiyasiz) ═══");
  console.log("  SINF".padEnd(16) + "n".padStart(8) + "WAPE".padStart(9) + "BIAS".padStart(9) + "FVA".padStart(9));
  const sinfGuruh = guruhla(rows, (x) => x.sinf);
  let jami = EMPTY;
  for (const s of SINFLAR) {
    const g = sinfGuruh.get(s);
    if (!g) continue;
    const acc = g.reduce((a, x) => add(a, scoreCell(x.actual, x.forecast, x.baseline, x.unitPrice)), EMPTY);
    jami = add(jami, acc);
    console.log(
      `  ${s.padEnd(14)}${String(g.length).padStart(8)}${pc(wape(acc)).padStart(9)}` +
        `${pc(bias(acc)).padStart(9)}${pc(fvaRel(acc)).padStart(9)}`
    );
  }
  console.log(
    `  ${"JAMI".padEnd(14)}${String(rows.length).padStart(8)}${pc(wape(jami)).padStart(9)}` +
      `${pc(bias(jami)).padStart(9)}${pc(fvaRel(jami)).padStart(9)}`
  );

  console.log("\n  ABC bo'yicha BIAS:");
  for (const [k, g] of [...guruhla(rows, (x) => x.abc ?? "—")].sort()) {
    const acc = g.reduce((a, x) => add(a, scoreCell(x.actual, x.forecast, x.baseline, x.unitPrice)), EMPTY);
    console.log(`    ${k.padEnd(4)}${String(g.length).padStart(8)}  WAPE ${pc(wape(acc)).padStart(7)}  BIAS ${pc(bias(acc)).padStart(7)}`);
  }

  // ── 2. BIAS TUZATISH (rolling, sizib chiqishsiz) ───────────────────────────────
  // Har oyna uchun koeffitsient FAQAT o'zidan OLDINGI oynalardan hisoblanadi.
  console.log("\n═══ 2. BIAS TUZATISH — o'tgan oynalardan o'rganib, keyingisiga qo'llash ═══");
  type Variant = "yo'q" | "global" | "sinf" | "sinf×abc";
  const variantlar: Variant[] = ["yo'q", "global", "sinf", "sinf×abc"];
  const natija = new Map<Variant, ErrAcc>(variantlar.map((v) => [v, EMPTY]));
  const qollangan = new Map<Variant, { n: number; sum: number }>(variantlar.map((v) => [v, { n: 0, sum: 0 }]));

  // Tarix akkumulyatorlari (oynalar bo'yicha o'sib boradi)
  const tarixGlobal = { acc: EMPTY };
  const tarixSinf = new Map<string, ErrAcc>();
  const tarixSinfAbc = new Map<string, ErrAcc>();

  for (const oyna of oynalar) {
    const paket = rows.filter((x) => x.tt === oyna);

    // Koeffitsientlar — SHU oynadan OLDINGI tarix bo'yicha
    const kG = qisqart(siqilgan(koeff(tarixGlobal.acc), tarixGlobal.acc.n));
    const kS = new Map<string, number>();
    for (const [k, a] of tarixSinf) kS.set(k, qisqart(siqilgan(koeff(a), a.n)));
    const kSA = new Map<string, number>();
    for (const [k, a] of tarixSinfAbc) kSA.set(k, qisqart(siqilgan(koeff(a), a.n)));

    for (const x of paket) {
      const abcKalit = `${x.sinf}|${x.abc ?? "—"}`;
      const kof: Record<Variant, number> = {
        "yo'q": 1,
        global: kG,
        sinf: kS.get(x.sinf) ?? 1,
        "sinf×abc": kSA.get(abcKalit) ?? kS.get(x.sinf) ?? 1,
      };
      for (const v of variantlar) {
        const k = kof[v];
        const st = qollangan.get(v)!;
        st.n++;
        st.sum += k;
        natija.set(v, add(natija.get(v)!, scoreCell(x.actual, x.forecast / k, x.baseline, x.unitPrice)));
      }
    }

    // Tarixni SHU oyna bilan boyitamiz (keyingi oyna uchun)
    for (const x of paket) {
      const a = scoreCell(x.actual, x.forecast, x.baseline, x.unitPrice);
      tarixGlobal.acc = add(tarixGlobal.acc, a);
      tarixSinf.set(x.sinf, add(tarixSinf.get(x.sinf) ?? EMPTY, a));
      const abcKalit = `${x.sinf}|${x.abc ?? "—"}`;
      tarixSinfAbc.set(abcKalit, add(tarixSinfAbc.get(abcKalit) ?? EMPTY, a));
    }
  }

  console.log("  VARIANT".padEnd(14) + "WAPE".padStart(9) + "BIAS".padStart(9) + "FVA".padStart(9) + "o'rt. k".padStart(10));
  const asos = wape(natija.get("yo'q")!)!;
  for (const v of variantlar) {
    const acc = natija.get(v)!;
    const st = qollangan.get(v)!;
    const w = wape(acc)!;
    const belgi = v === "yo'q" ? "" : `  (${w < asos ? "yaxshiroq" : "yomonroq"} ${pc(Math.abs(asos - w), 2)})`;
    console.log(
      `  ${v.padEnd(12)}${pc(w).padStart(9)}${pc(bias(acc)).padStart(9)}${pc(fvaRel(acc)).padStart(9)}` +
        `${(st.sum / st.n).toFixed(3).padStart(10)}${belgi}`
    );
  }

  // ── 3. q90 — formula vs empirik kvantil ───────────────────────────────────────
  console.log("\n═══ 3. q90 — FORMULA vs EMPIRIK KVANTIL (maqsad: qoplash 90%) ═══");
  console.log(
    "  SINF".padEnd(16) +
      "n".padStart(7) +
      "p50=0".padStart(7) +
      "|  formula: qoplash".padStart(20) +
      "o'rt.×".padStart(8) +
      "ortiqcha".padStart(10) +
      "|  empirik ×".padStart(13) +
      "qoplash".padStart(9) +
      "ortiqcha".padStart(10)
  );

  const ortiqcha = (rs: Qator[], q: (x: Qator) => number) => {
    // Qoplangan holatlarda ortiqcha zaxira (dona) — teng qoplashda kichigi yaxshi
    let s = 0;
    let n = 0;
    for (const x of rs) {
      const v = q(x);
      if (x.actual <= v) {
        s += v - x.actual;
        n++;
      }
    }
    return n > 0 ? s / n : null;
  };

  const empirikMult = new Map<string, number>();
  for (const s of [...SINFLAR, "JAMI"]) {
    const g = s === "JAMI" ? rows : (sinfGuruh.get(s) ?? []);
    if (g.length === 0) continue;
    const nolP50 = g.filter((x) => x.forecast <= 0).length;
    const musbat = g.filter((x) => x.forecast > 0);
    const nisbatlar = musbat.map((x) => x.actual / x.forecast).sort((a, b) => a - b);
    const m = kvantil(nisbatlar, 0.9) ?? 1;
    if (s !== "JAMI") empirikMult.set(s, m);

    const fQoplash = g.filter((x) => x.actual <= x.q90).length / g.length;
    const fMult = musbat.reduce((a, x) => a + x.q90 / x.forecast, 0) / Math.max(1, musbat.length);
    const eQoplash = g.filter((x) => x.actual <= x.forecast * m).length / g.length;

    console.log(
      `  ${s.padEnd(14)}${String(g.length).padStart(7)}${pc(nolP50 / g.length, 0).padStart(7)}` +
        `${pc(fQoplash).padStart(20)}${fMult.toFixed(2).padStart(8)}${(ortiqcha(g, (x) => x.q90) ?? 0).toFixed(1).padStart(10)}` +
        `${m.toFixed(2).padStart(13)}${pc(eQoplash).padStart(9)}${(ortiqcha(g, (x) => x.forecast * m) ?? 0).toFixed(1).padStart(10)}`
    );
  }

  // ── 4. Rolling (sizib chiqishsiz) — 4 qoida, newsvendor iqtisodi bilan ────────
  // ORTIQCHA = Σmax(0, q − fakt) / n (kutilgan ortiqcha zaxira, dona)
  // KAMOMAD  = Σmax(0, fakt − q) / n (kutilgan yo'qotilgan sotuv, dona)
  // Qoplash 90% ga yetsa ham, ortiqcha juda katta bo'lsa qoida ISHLAMAYDI.
  console.log("\n═══ 4. ROLLING (o'tgan oynalardan o'rganib) — 4 qoida ═══");
  // "sqrt" — talab SANOQ tabiatiga ega (Puasson'ga yaqin): σ ∝ √o'rtacha. Shu sabab
  // qoldiqni √(p50+1) ga normalizatsiya qilib kvantil olamiz. Bu additiv (σ o'zgarmas)
  // va multiplikativ (σ ∝ o'rtacha) o'rtasidagi nazariy jihatdan to'g'ri o'rta.
  type Qoida = "formula" | "mult" | "additiv" | "sqrt";
  const QOIDALAR: Qoida[] = ["formula", "mult", "additiv", "sqrt"];
  const stat = new Map<string, { n: number; qopladi: number; ortiqcha: number; kamomad: number }>();
  const yoz = (sinf: string, q: Qoida, qq: number, actual: number) => {
    for (const k of [`${sinf}|${q}`, `JAMI|${q}`]) {
      const s = stat.get(k) ?? { n: 0, qopladi: 0, ortiqcha: 0, kamomad: 0 };
      s.n++;
      if (actual <= qq) s.qopladi++;
      s.ortiqcha += Math.max(0, qq - actual);
      s.kamomad += Math.max(0, actual - qq);
      stat.set(k, s);
    }
  };

  // `Math.max(0, …)` — bazada manfiy p50 bor (qaytim; model qatlamida endi to'silgan,
  // lekin eski qatorlar qolgan). To'silmasa √(manfiy) = NaN butun sinfni buzadi.
  const masshtab = (p50: number) => Math.sqrt(Math.max(0, p50) + 1);
  const tarixNisbat = new Map<string, number[]>(); // sinf → fakt/p50 (p50 > 0)
  const tarixQoldiq = new Map<string, number[]>(); // sinf → fakt − p50
  const tarixSqrt = new Map<string, number[]>(); // sinf → (fakt − p50) / √(p50+1)
  const kalibr = new Map<string, { m: number; a: number; c: number }>();
  for (const oyna of oynalar) {
    const paket = rows.filter((x) => x.tt === oyna);
    const mult = new Map<string, number>();
    const addit = new Map<string, number>();
    const sq = new Map<string, number>();
    for (const [k, arr] of tarixNisbat) mult.set(k, kvantil([...arr].sort((a, b) => a - b), 0.9) ?? 1);
    for (const [k, arr] of tarixQoldiq) addit.set(k, kvantil([...arr].sort((a, b) => a - b), 0.9) ?? 0);
    for (const [k, arr] of tarixSqrt) sq.set(k, kvantil([...arr].sort((a, b) => a - b), 0.9) ?? 0);

    for (const x of paket) {
      const m = mult.get(x.sinf);
      const a = addit.get(x.sinf);
      const c = sq.get(x.sinf);
      if (m == null || a == null || c == null) continue; // birinchi oyna — tarix yo'q
      kalibr.set(x.sinf, { m, a, c }); // oxirgi oynadagi qiymat — hisobotda ko'rsatiladi
      yoz(x.sinf, "formula", x.q90, x.actual);
      yoz(x.sinf, "mult", x.forecast * m, x.actual);
      yoz(x.sinf, "additiv", x.forecast + a, x.actual);
      yoz(x.sinf, "sqrt", x.forecast + c * masshtab(x.forecast), x.actual);
    }
    for (const x of paket) {
      if (x.forecast > 0) {
        const arr = tarixNisbat.get(x.sinf) ?? [];
        arr.push(x.actual / x.forecast);
        tarixNisbat.set(x.sinf, arr);
      }
      const arr2 = tarixQoldiq.get(x.sinf) ?? [];
      arr2.push(x.actual - x.forecast);
      tarixQoldiq.set(x.sinf, arr2);
      const arr3 = tarixSqrt.get(x.sinf) ?? [];
      arr3.push((x.actual - x.forecast) / masshtab(x.forecast));
      tarixSqrt.set(x.sinf, arr3);
    }
  }

  console.log("  SINF".padEnd(15) + "QOIDA".padEnd(10) + "qoplash".padStart(9) + "ortiqcha".padStart(10) + "kamomad".padStart(9));
  for (const s of [...SINFLAR, "JAMI"]) {
    for (const q of QOIDALAR) {
      const st = stat.get(`${s}|${q}`);
      if (!st) continue;
      console.log(
        `  ${(q === "formula" ? s : "").padEnd(13)}${q.padEnd(10)}${pc(st.qopladi / st.n).padStart(9)}` +
          `${(st.ortiqcha / st.n).toFixed(1).padStart(10)}${(st.kamomad / st.n).toFixed(1).padStart(9)}`
      );
    }
    console.log("  " + "─".repeat(42));
  }
  const eN = stat.get("JAMI|mult")?.n ?? 0;
  const eQopladi = stat.get("JAMI|mult")?.qopladi ?? 0;
  const fN = stat.get("JAMI|formula")?.n ?? 1;
  const fQopladi = stat.get("JAMI|formula")?.qopladi ?? 0;
  console.log(`  (n = ${eN.toLocaleString("ru-RU")}, birinchi oyna tarixsiz — chiqarilgan)`);
  console.log("\n  Oxirgi oynadagi kalibratsiya (sinf → mult ×, additiv +dona, sqrt c):");
  for (const s of SINFLAR) {
    const k = kalibr.get(s);
    if (k) console.log(`    ${s.padEnd(14)} mult ${k.m.toFixed(2).padStart(6)}   additiv ${k.a.toFixed(1).padStart(7)}   sqrt c ${k.c.toFixed(2).padStart(6)}`);
  }

  console.log("\n═══ XULOSA ═══");
  const eng = variantlar
    .map((v) => ({ v, w: wape(natija.get(v)!)! }))
    .sort((a, b) => a.w - b.w)[0];
  console.log(`  BIAS tuzatish: eng yaxshi variant "${eng.v}" (WAPE ${pc(eng.w)}, asos ${pc(asos)})`);
  console.log(`  q90: empirik kvantil ${eQopladi / eN >= 0.87 ? "maqsadga yaqin" : "hali past"}, formula ${pc(fQopladi / fN)} qoplaydi`);
  console.log("  Empirik multiplikatorlar (sinf):", Object.fromEntries([...empirikMult].map(([k, v]) => [k, +v.toFixed(2)])));
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => pgPool.end());
