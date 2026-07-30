import { describe, it, expect } from "vitest";
import {
  C_SOVUQ,
  K_MAX,
  K_MIN,
  SERVIS,
  SHRINK_N,
  biasKoeff,
  cUchun,
  kalibrla,
  masshtab,
  qisqart,
  siqilgan,
  siqilganC,
  sovuqKalib,
} from "./kalibr";

describe("BIAS koeffitsienti", () => {
  it("k = ΣF / ΣA — model ko'p prognoz qilgan bo'lsa k > 1", () => {
    // Katta namuna (shrinkage deyarli ta'sir qilmaydi)
    const k = biasKoeff(1_080_000, 1_000_000, 1_000_000);
    expect(k).toBeGreaterThan(1.07);
    expect(k).toBeLessThan(1.081);
  });

  it("prognoz k ga BO'LINADI — ya'ni k > 1 prognozni kamaytiradi", () => {
    const kal = sovuqKalib();
    kal.biasK = 1.08;
    const { p50 } = kalibrla(108, "SMOOTH", kal);
    expect(p50).toBeCloseTo(100, 5);
  });

  it("KICHIK namunada 1 ga tortiladi (shrinkage)", () => {
    const kichik = biasKoeff(200, 100, 100); // xom k = 2, lekin n kichik
    const katta = biasKoeff(200_000, 100_000, 100_000);
    expect(kichik).toBeLessThan(katta);
    expect(kichik).toBeLessThan(1.1);
  });

  it("shrinkage formulasi: n = SHRINK_N da yarim yo'lda", () => {
    expect(siqilgan(2, SHRINK_N)).toBeCloseTo(1.5, 5);
    expect(siqilgan(2, 0)).toBe(1);
  });

  it("CHEGARA: kalibratsiya modelni buzib yubormaydi", () => {
    expect(biasKoeff(10_000_000, 100_000, 1_000_000)).toBe(K_MAX); // xom k = 100
    expect(biasKoeff(100_000, 10_000_000, 1_000_000)).toBe(K_MIN); // xom k = 0.01
  });

  it("fakt yoki prognoz nol bo'lsa tuzatish YO'Q (1)", () => {
    expect(biasKoeff(0, 100, 50)).toBe(1);
    expect(biasKoeff(100, 0, 50)).toBe(1);
    expect(biasKoeff(100, -5, 50)).toBe(1);
  });
});

describe("empirik kvantil (√-masshtab)", () => {
  it("masshtab manfiy p50'da ham NaN bermaydi (qaytim)", () => {
    expect(masshtab(0)).toBe(1);
    expect(masshtab(-12_885)).toBe(1); // to'silmasa √(manfiy) = NaN — o'lchovda shu bo'ldi
    expect(masshtab(99)).toBeCloseTo(10, 5);
  });

  it("q90 = p50 + c·√(p50+1)", () => {
    const kal = sovuqKalib();
    kal.sinf.set("SMOOTH", { c: 4, n: 100_000 });
    const { p50, q90 } = kalibrla(99, "SMOOTH", kal);
    expect(p50).toBe(99);
    expect(q90).toBeCloseTo(99 + 4 * 10, 5);
  });

  it("p50 = 0 bo'lsa ham bufer QO'YILADI — multiplikativ qoida buni qila olmasdi", () => {
    // INTERMITTENT/LUMPY'da oynalarning 29% va 56% ida p50 = 0. m·0 = 0 hech qachon
    // qoplamaydi; additiv shakl esa qoplaydi (LUMPY: 74.9% → 91.0%).
    const kal = sovuqKalib();
    kal.sinf.set("LUMPY", { c: 8.4, n: 100_000 });
    const { p50, q90 } = kalibrla(0, "LUMPY", kal);
    expect(p50).toBe(0);
    expect(q90).toBeCloseTo(8.4, 5);
  });

  it("q90 hech qachon p50'dan kichik emas", () => {
    const kal = sovuqKalib();
    kal.sinf.set("SMOOTH", { c: -5, n: 100_000 }); // manfiy c (nazariy)
    const { p50, q90 } = kalibrla(10, "SMOOTH", kal);
    expect(q90).toBeGreaterThanOrEqual(p50);
  });

  it("kvantil koeffitsienti kichik namunada sovuq start qiymatiga tortiladi", () => {
    const sovuq = C_SOVUQ.SMOOTH;
    const kichik = siqilganC(20, sovuq, 10);
    const katta = siqilganC(20, sovuq, 1_000_000);
    // n = 10 da og'irlik 10/(10+2000) ≈ 0.5% — xom 20 dan sovuq 4.17 ga deyarli to'liq tortiladi
    expect(kichik - sovuq).toBeLessThan(0.1);
    expect(kichik).toBeGreaterThan(sovuq); // lekin bir oz siljiydi (mutlaqo qotib qolmaydi)
    expect(katta).toBeGreaterThan(19);
  });
});

describe("sovuq start", () => {
  it("tarix yo'q — o'lchangan default qiymatlar, tuzatish yo'q", () => {
    const kal = sovuqKalib();
    expect(kal.biasK).toBe(1);
    expect(kal.biasN).toBe(0);
    expect(kal.servis).toBe(SERVIS);
    expect(cUchun(kal, "SMOOTH")).toBe(C_SOVUQ.SMOOTH);
    expect(cUchun(kal, "LUMPY")).toBe(C_SOVUQ.LUMPY);
  });

  it("KAM sinfda bufer 0 (u sinfda prognoz yozilmaydi)", () => {
    expect(cUchun(sovuqKalib(), "KAM")).toBe(0);
  });
});

describe("kalibrla — tartib va manfiylik", () => {
  it("avval BIAS, keyin bufer (aks holda bufer ham qisqarardi)", () => {
    const kal = sovuqKalib();
    kal.biasK = 2;
    kal.sinf.set("SMOOTH", { c: 3, n: 100_000 });
    const { p50, q90 } = kalibrla(200, "SMOOTH", kal);
    expect(p50).toBe(100); // 200 / 2
    // bufer TUZATILGAN p50 ustiga: 100 + 3·√101 ≈ 130.1
    expect(q90).toBeCloseTo(100 + 3 * Math.sqrt(101), 5);
  });

  it("manfiy xom prognoz nolga tushadi", () => {
    const kal = sovuqKalib();
    kal.sinf.set("INTERMITTENT", { c: 3, n: 100_000 });
    const { p50, q90 } = kalibrla(-500, "INTERMITTENT", kal);
    expect(p50).toBe(0);
    expect(q90).toBeCloseTo(3, 5);
  });

  it("qisqart chegaralarni hurmat qiladi", () => {
    expect(qisqart(5, 0, 3)).toBe(3);
    expect(qisqart(-5, 0, 3)).toBe(0);
    expect(qisqart(2, 0, 3)).toBe(2);
  });
});
