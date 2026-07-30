import { describe, it, expect } from "vitest";
import { add, wape, bias, fvaRel, fvaPp, scoreCell, rmsse, EMPTY } from "./metrics";
import { naive1, movingAvg, combo50, scaleMse, q90, nolEhtimoli } from "./model";
import { sinfla, seriyalarga, type PanelCell } from "./panel";

describe("metrics — yig'indilar, nisbatlar emas", () => {
  it("WAPE = Σ|A−F| / ΣA", () => {
    const a = scoreCell(10, 8, 12, 1); // |10−8|=2
    const b = scoreCell(20, 25, 18, 1); // |20−25|=5
    const j = add(a, b);
    expect(j.actual).toBe(30);
    expect(j.absErr).toBe(7);
    expect(wape(j)).toBeCloseTo(7 / 30);
  });

  it("agregat WAPE seriya-o'rtachasidan FARQ QILADI — shuning uchun yig'indi saqlanadi", () => {
    const kichik = scoreCell(1, 2, 1, 1); // WAPE = 1.0
    const katta = scoreCell(1000, 1010, 1000, 1); // WAPE = 0.01
    const agregat = wape(add(kichik, katta))!;
    const ortacha = (wape(kichik)! + wape(katta)!) / 2;
    expect(agregat).toBeCloseTo(11 / 1001, 4); // |1−2| + |1000−1010| = 11, ΣA = 1001
    expect(ortacha).toBeCloseTo(0.505, 3);
    expect(agregat).not.toBeCloseTo(ortacha, 2); // ikki xil raqam — aralashtirilmasin
  });

  it("fakt 0 bo'lsa WAPE null (MAPE bo'lsa nolga bo'linardi)", () => {
    expect(wape(scoreCell(0, 5, 3, 1))).toBeNull();
    expect(wape(EMPTY)).toBeNull();
  });

  it("BIAS ishorasi: musbat — tizimli ko'p", () => {
    expect(bias(scoreCell(10, 15, 10, 1))!).toBeCloseTo(0.5);
    expect(bias(scoreCell(10, 5, 10, 1))!).toBeCloseTo(-0.5);
  });

  it("add() scaleMse'ni yo'qotadi — RMSSE faqat seriya darajasida o'qiladi", () => {
    const a = { ...scoreCell(10, 9, 11, 1), scaleMse: 4 };
    expect(rmsse(a)).not.toBeNull();
    expect(add(a, a).scaleMse).toBeNull();
    expect(rmsse(add(a, a))).toBeNull();
  });
});

describe("FVA — model naive'dan yaxshiroqmi", () => {
  it("model naive bilan bir xil bo'lsa FVA = 0", () => {
    const a = scoreCell(10, 12, 12, 1);
    expect(fvaRel(a)).toBeCloseTo(0);
  });

  it("model yaxshiroq bo'lsa FVA musbat", () => {
    const a = scoreCell(10, 11, 15, 1); // model xato 1, naive xato 5
    expect(fvaRel(a)).toBeCloseTo(0.8);
  });

  it("model YOMONROQ bo'lsa FVA MANFIY — bu holat yashirilmaydi", () => {
    const a = scoreCell(10, 20, 11, 1); // model xato 10, naive xato 1
    expect(fvaRel(a)!).toBeLessThan(0);
  });

  it("fvaPp — WAPE necha punktga yaxshilandi", () => {
    const a = scoreCell(100, 90, 70, 1); // model 10, naive 30 → 20/100
    expect(fvaPp(a)).toBeCloseTo(0.2);
  });
});

describe("model — gorizont JAMISI qaytaradi", () => {
  const train = [2, 0, 4, 0, 6, 0, 8, 4];

  it("naive1 = oxirgi hafta × gorizont", () => {
    expect(naive1(train, 1)).toBe(4);
    expect(naive1(train, 4)).toBe(16);
  });

  it("MA4 = oxirgi 4 hafta o'rtachasi × gorizont", () => {
    // [0,8,4] emas, [0,6,0,8,4] dan oxirgi 4: [6,0,8,4] → yo'q, [0,8,4] uzunlik 4 → [6,0,8,4]
    const oxirgi4 = train.slice(-4); // [0, 8, 4] emas — [6, 0, 8, 4]? tekshiramiz
    const ort = oxirgi4.reduce((s, v) => s + v, 0) / oxirgi4.length;
    expect(movingAvg(train, 1, 4)).toBeCloseTo(ort);
    expect(movingAvg(train, 4, 4)).toBeCloseTo(ort * 4);
  });

  it("combo50 = 0.5·naive + 0.5·MA4", () => {
    expect(combo50(train, 4)).toBeCloseTo(0.5 * naive1(train, 4) + 0.5 * movingAvg(train, 4, 4));
  });

  it("bo'sh train — 0 (xato tashlamaydi)", () => {
    expect(naive1([], 4)).toBe(0);
    expect(movingAvg([], 4, 4)).toBe(0);
    expect(combo50([], 4)).toBe(0);
  });

  it("MANFIY prognoz bo'lmaydi — qaytim (soldQty < 0) nolda to'xtaydi", () => {
    // Jonli bazada 40 seriya-hafta manfiy (qaytim sotuvdan ko'p). To'silmasa
    // p50 = −12 885 saqlanib, √(p50+1) NaN berardi va butun kesimni buzardi.
    expect(naive1([5, 5, -100], 4)).toBe(0);
    expect(movingAvg([-10, -10, -10, -10], 4, 4)).toBe(0);
    expect(combo50([2, 2, 2, -50], 4)).toBe(0);
    expect(q90(-5, [1, -100, 2], 4, 1.28)).toBeGreaterThanOrEqual(0);
  });

  it("nolda to'xtatish MUSBAT qiymatlarga tegmaydi", () => {
    expect(naive1([1, 2, 3], 4)).toBe(12);
    expect(movingAvg([2, 2, 2, 2], 2, 4)).toBe(4);
  });

  it("scaleMse: o'zgarmas seriyada null (nolga bo'linishni oldini oladi)", () => {
    expect(scaleMse([5, 5, 5, 5])).toBeNull();
    expect(scaleMse([1])).toBeNull();
    expect(scaleMse([1, 3, 1])).toBeCloseTo((4 + 4) / 2);
  });

  it("q90 P50 dan katta va √h bilan o'sadi", () => {
    const p50 = combo50(train, 4);
    const a = q90(p50, train, 4, 1.3);
    const b = q90(p50, train, 8, 1.3);
    expect(a).toBeGreaterThan(p50);
    expect(b).toBeGreaterThan(a);
  });

  it("nolEhtimoli — LUMPY sinfda P50 o'rniga ko'rsatiladi", () => {
    expect(nolEhtimoli([0, 0, 5, 0])).toBeCloseTo(0.75);
    expect(nolEhtimoli([1, 2, 3])).toBe(0);
  });
});

describe("sinfla — Syntetos-Boylan kvadrantlari", () => {
  it("nolmas hafta < 4 → KAM (model qurilmaydi)", () => {
    expect(sinfla([0, 0, 5, 0, 0, 3, 0, 0]).sinf).toBe("KAM");
  });

  it("har hafta barqaror sotuv → SMOOTH", () => {
    const r = sinfla([10, 11, 10, 12, 10, 11, 10, 11]);
    expect(r.sinf).toBe("SMOOTH");
    expect(r.adi).toBeCloseTo(1);
  });

  it("siyrak va notekis → LUMPY", () => {
    const r = sinfla([0, 0, 1, 0, 0, 50, 0, 0, 2, 0, 0, 80]);
    expect(r.sinf).toBe("LUMPY");
    expect(r.adi!).toBeGreaterThan(1.32);
  });

  it("har hafta sotiladi lekin miqdor keskin o'zgaradi → ERRATIC", () => {
    const r = sinfla([1, 40, 2, 50, 3, 60, 1, 45]);
    expect(r.sinf).toBe("ERRATIC");
  });
});

describe("seriyalarga — nol-to'ldirish", () => {
  it("qator YO'Q bo'lgan hafta 0 bo'lib to'ldiriladi", () => {
    const cells: PanelCell[] = [
      { pid: 1, bid: 1, i: 1, w: "2026-01-05", unit_price: 100, qty: 5, amt: 500, had_no_row: false, stockout: false },
      // i=2 yo'q — sotuv bo'lmagan hafta
      { pid: 1, bid: 1, i: 3, w: "2026-01-19", unit_price: 100, qty: 3, amt: 300, had_no_row: false, stockout: false },
    ];
    const s = seriyalarga(cells);
    expect(s).toHaveLength(1);
    expect(s[0].qty).toEqual([5, 0, 3]);
  });

  it("bir necha seriya ajratiladi", () => {
    const cells: PanelCell[] = [
      { pid: 1, bid: 1, i: 1, w: "w", unit_price: 10, qty: 5, amt: 50, had_no_row: false, stockout: false },
      { pid: 1, bid: 2, i: 1, w: "w", unit_price: 10, qty: 7, amt: 70, had_no_row: false, stockout: false },
      { pid: 2, bid: 1, i: 1, w: "w", unit_price: 10, qty: 9, amt: 90, had_no_row: false, stockout: false },
    ];
    expect(seriyalarga(cells)).toHaveLength(3);
  });
});
