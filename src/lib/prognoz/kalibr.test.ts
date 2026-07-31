import { describe, it, expect } from "vitest";
import {
  ABC_YOQ,
  BANDLAR,
  C_MIN_N,
  C_SOVUQ,
  K_MAX,
  K_MIN,
  SERVIS,
  SHRINK_N,
  bandCaseSQL,
  bandNomi,
  biasKoeff,
  cUchun,
  kalibrla,
  kvantKalit,
  masshtab,
  qisqart,
  siqilgan,
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
    const { p50 } = kalibrla(108, "SMOOTH", null, kal);
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
    kal.kvantBand.set(bandNomi(99), { c: 4, n: 100_000 });
    const { p50, q90 } = kalibrla(99, "SMOOTH", null, kal);
    expect(p50).toBe(99);
    expect(q90).toBeCloseTo(99 + 4 * 10, 5);
  });

  it("p50 = 0 bo'lsa ham bufer QO'YILADI — multiplikativ qoida buni qila olmasdi", () => {
    // INTERMITTENT/LUMPY'da oynalarning 29% va 56% ida p50 = 0. m·0 = 0 hech qachon
    // qoplamaydi; additiv shakl esa qoplaydi (LUMPY: 74.9% → 91.0%).
    const kal = sovuqKalib();
    kal.kvantBand.set(bandNomi(0), { c: 8.4, n: 100_000 });
    const { p50, q90 } = kalibrla(0, "LUMPY", null, kal);
    expect(p50).toBe(0);
    expect(q90).toBeCloseTo(8.4, 5);
  });

  it("q90 hech qachon p50'dan kichik emas", () => {
    const kal = sovuqKalib();
    kal.kvantBand.set(bandNomi(10), { c: -5, n: 100_000 }); // manfiy c (nazariy)
    const { p50, q90 } = kalibrla(10, "SMOOTH", null, kal);
    expect(q90).toBeGreaterThanOrEqual(p50);
  });

  it("KVANTIL SIQILMAYDI — bu o'lchangan yaxshilanishni bekor qilgan edi", () => {
    // Tarixiy xato: kvantil ota-kesim qiymatiga SHRINK_N = 2000 bilan tortilardi.
    // `A|1k+` (n = 143) o'z signalining 6.7% ini saqlab qolib, natija band-darajali
    // kalibratsiyaga aylanardi — jonli o'lchovda A sinf 85.1% → 83.2%.
    // Endi kesim o'z kvantilini AYNAN ishlatadi (n >= C_MIN_N).
    expect(C_MIN_N).toBe(50);
    const kal = sovuqKalib();
    kal.kvantBand.set("1k+", { c: 5, n: 100_000 });
    kal.kvant.set(kvantKalit("A", "1k+"), { c: 18.7, n: 143 });
    expect(cUchun(kal, "SMOOTH", "A", 5000)).toBe(18.7); // 5 ga TORTILMAYDI
  });
});

describe("kvantil kaliti: abc×band → band → sovuq", () => {
  it("ABC×band kesimi bo'lsa AYNAN u ishlatiladi", () => {
    const kal = sovuqKalib();
    kal.kvantBand.set("30-100", { c: 4, n: 100_000 });
    kal.kvant.set(kvantKalit("A", "30-100"), { c: 9, n: 50_000 });
    expect(cUchun(kal, "SMOOTH", "A", 50)).toBe(9);
    expect(cUchun(kal, "SMOOTH", "C", 50)).toBe(4); // C uchun kesim yo'q → band darajasi
  });

  it("ikkisi ham yo'q bo'lsa sovuq start (sinf bo'yicha)", () => {
    expect(cUchun(sovuqKalib(), "ERRATIC", "B", 50)).toBe(C_SOVUQ.ERRATIC);
  });

  it("ABC sinfi yo'q SKU o'z kalitiga tushadi (bo'sh satr emas)", () => {
    const kal = sovuqKalib();
    kal.kvant.set(kvantKalit(null, "0"), { c: 2, n: 10_000 });
    expect(cUchun(kal, "LUMPY", null, 0)).toBe(2);
    expect(cUchun(kal, "LUMPY", "", 0)).toBe(2); // bo'sh satr ham AYNI kalit
    expect(kvantKalit(null, "0")).toBe(`${ABC_YOQ}|0`);
  });

  it("BAND kalitning ikkinchi o'lchovi — AYNI ABC'da katta p50 boshqa bufer oladi", () => {
    // Bu Faza 3.1 ning mag'zi: faqat ABC bo'yicha kalibrlanganda `1k+` band 76.1%
    // qoplanardi (kamomad 344 dona), band qo'shilgach 89.8% (217 dona).
    const kal = sovuqKalib();
    kal.kvant.set(kvantKalit("A", "3-10"), { c: 2, n: 50_000 });
    kal.kvant.set(kvantKalit("A", "1k+"), { c: 11, n: 50_000 });
    expect(cUchun(kal, "SMOOTH", "A", 5)).toBe(2);
    expect(cUchun(kal, "SMOOTH", "A", 5000)).toBe(11);
  });

  it("band chegaralari: 0 alohida, keyin logarifmik", () => {
    expect(bandNomi(0)).toBe("0");
    expect(bandNomi(-5)).toBe("0"); // manfiy p50 (qaytim) ham "0" bandiga
    expect(bandNomi(1)).toBe("0-1");
    expect(bandNomi(1.01)).toBe("1-3");
    expect(bandNomi(1000)).toBe("300-1k");
    expect(bandNomi(1000.1)).toBe("1k+");
  });

  it("SQL va TS bandlari BIR XIL ta'rifdan chiqadi", () => {
    // Ta'rif ikkiga bo'linsa kalibratsiya bir bandda o'rganib boshqasiga qo'llanardi
    const sql = bandCaseSQL("x");
    for (const [, nom] of BANDLAR) expect(sql).toContain(`'${nom}'`);
  });
});

describe("sovuq start", () => {
  it("tarix yo'q — o'lchangan default qiymatlar, tuzatish yo'q", () => {
    const kal = sovuqKalib();
    expect(kal.biasK).toBe(1);
    expect(kal.biasN).toBe(0);
    expect(kal.servis).toBe(SERVIS);
    expect(cUchun(kal, "SMOOTH", null, 10)).toBe(C_SOVUQ.SMOOTH);
    expect(cUchun(kal, "LUMPY", null, 10)).toBe(C_SOVUQ.LUMPY);
  });

  it("KAM sinfda bufer 0 (u sinfda prognoz yozilmaydi)", () => {
    expect(cUchun(sovuqKalib(), "KAM", null, 10)).toBe(0);
  });
});

describe("kalibrla — tartib va manfiylik", () => {
  it("avval BIAS, keyin bufer (aks holda bufer ham qisqarardi)", () => {
    const kal = sovuqKalib();
    kal.biasK = 2;
    kal.kvantBand.set(bandNomi(100), { c: 3, n: 100_000 });
    const { p50, q90 } = kalibrla(200, "SMOOTH", null, kal);
    expect(p50).toBe(100); // 200 / 2
    // bufer TUZATILGAN p50 ustiga: 100 + 3·√101 ≈ 130.1
    expect(q90).toBeCloseTo(100 + 3 * Math.sqrt(101), 5);
  });

  it("manfiy xom prognoz nolga tushadi", () => {
    const kal = sovuqKalib();
    kal.kvantBand.set(bandNomi(0), { c: 3, n: 100_000 });
    const { p50, q90 } = kalibrla(-500, "INTERMITTENT", null, kal);
    expect(p50).toBe(0);
    expect(q90).toBeCloseTo(3, 5);
  });

  it("qisqart chegaralarni hurmat qiladi", () => {
    expect(qisqart(5, 0, 3)).toBe(3);
    expect(qisqart(-5, 0, 3)).toBe(0);
    expect(qisqart(2, 0, 3)).toBe(2);
  });
});
