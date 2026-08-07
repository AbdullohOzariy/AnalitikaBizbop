import { describe, it, expect, vi } from "vitest";

// report.ts prisma / next-cache / telegraf ni tortadi — testda ular kerak emas,
// tekshirilayotgani SOF mantiq (norma ustunligi va Excel qatorlari).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const { normalarniYoy, excelQatorlar } = await import("./report");

const limits = (global: number | null, pairs: [number, number][]) => ({
  global,
  byCategory: new Map(pairs),
});

describe("normalarniYoy — ustunlik qoidasi", () => {
  // Iyerarxiya: 1 (ota) → 10, 11 (sub);  2 (ota) → 20 (sub)
  const cats = [
    { id: 1, parentId: null },
    { id: 10, parentId: 1 },
    { id: 11, parentId: 1 },
    { id: 2, parentId: null },
    { id: 20, parentId: 2 },
  ];

  it("subkategoriya normasi ota kategoriyanikidan USTUN", () => {
    const m = normalarniYoy(limits(null, [[1, 30], [10, 7]]), cats);
    expect(m.get(10)).toBe(7); // o'ziniki
    expect(m.get(11)).toBe(30); // otasidan meros
    expect(m.get(1)).toBe(30);
  });

  it("o'zi ham, otasi ham yo'q bo'lsa — global standart", () => {
    const m = normalarniYoy(limits(45, [[1, 30]]), cats);
    expect(m.get(20)).toBe(45);
    expect(m.get(2)).toBe(45);
    expect(m.get(10)).toBe(30); // otasidan
  });

  it("global yo'q va norma yo'q — kategoriya ro'yxatga TUSHMAYDI", () => {
    const m = normalarniYoy(limits(null, [[1, 30]]), cats);
    expect(m.has(20)).toBe(false);
    expect(m.has(2)).toBe(false);
    expect(m.size).toBe(3); // 1, 10, 11
  });

  it("norma 0 yoki manfiy bo'lsa e'tiborga olinmaydi", () => {
    const m = normalarniYoy(limits(null, [[1, 0], [2, -5]]), cats);
    expect(m.size).toBe(0);
  });

  it("hech qanday norma yo'q — bo'sh xarita", () => {
    expect(normalarniYoy(limits(null, []), cats).size).toBe(0);
  });

  it("faqat global — barcha kategoriyalar qamraladi", () => {
    const m = normalarniYoy(limits(21, []), cats);
    expect(m.size).toBe(cats.length);
    expect([...new Set(m.values())]).toEqual([21]);
  });
});

describe("excelQatorlar", () => {
  const qator = {
    branch: "Chilonzor",
    code: 1234,
    pname: "KONSERVA LOVIYA",
    cname: "KONSERVA",
    stockQty: 420,
    avgDaily: 2.1,
    stockDays: 200,
    norma: 60,
    oshgan: 140,
    ortiqchaQty: 294,
    ortiqchaPul: 1_470_000.7,
  };

  it("sarlavha + ma'lumot qatorlari", () => {
    const out = excelQatorlar([qator]);
    expect(out).toHaveLength(2);
    expect(out[0][0]).toBe("Filial");
    expect(out[0]).toHaveLength(11);
    expect(out[1]).toHaveLength(11);
  });

  it("son qiymatlar MATN emas — Excel'da saralanishi uchun", () => {
    const [, data] = excelQatorlar([qator]);
    for (const i of [1, 4, 5, 6, 7, 8, 9, 10]) {
      expect(typeof data[i]).toBe("number");
    }
  });

  it("kasrlar bir xonagacha, summa butunga yaxlitlanadi", () => {
    const [, data] = excelQatorlar([{ ...qator, stockDays: 200.44, ortiqchaPul: 1_470_000.7 }]);
    expect(data[5]).toBe(200.4);
    expect(data[10]).toBe(1_470_001);
  });

  it("kategoriyasi yo'q SKU bo'sh matn bilan chiqadi (null emas)", () => {
    const [, data] = excelQatorlar([{ ...qator, cname: null }]);
    expect(data[3]).toBe("");
  });

  it("qator yo'q bo'lsa faqat sarlavha qoladi", () => {
    expect(excelQatorlar([])).toHaveLength(1);
  });
});

describe("parseExcludeCodes", () => {
  it("vergul, bo'shliq va yangi qatorni ham qabul qiladi", async () => {
    const { parseExcludeCodes } = await import("./sozlama");
    expect(parseExcludeCodes("36919, 36920")).toEqual([36919, 36920]);
    expect(parseExcludeCodes("36919 36920")).toEqual([36919, 36920]);
    expect(parseExcludeCodes("36919\n36920;51325")).toEqual([36919, 36920, 51325]);
  });

  it("raqam bo'lmagan bo'laklarni tashlaydi — izoh yozilsa ham buzilmaydi", async () => {
    const { parseExcludeCodes } = await import("./sozlama");
    expect(parseExcludeCodes("36919 dostavka, 51325")).toEqual([36919, 51325]);
  });

  it("takrorlanish va nol/manfiy qiymat tushmaydi", async () => {
    const { parseExcludeCodes } = await import("./sozlama");
    expect(parseExcludeCodes("100, 100, 0, -5")).toEqual([100]);
  });

  it("bo'sh va null — bo'sh massiv", async () => {
    const { parseExcludeCodes } = await import("./sozlama");
    expect(parseExcludeCodes("")).toEqual([]);
    expect(parseExcludeCodes(null)).toEqual([]);
    expect(parseExcludeCodes("   ")).toEqual([]);
  });
});
