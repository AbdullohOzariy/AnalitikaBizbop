import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseSalesWorkbook } from "@/lib/parsers/sales";

// Sotuv parseri — pul fakti DB'ga aynan shu yerdan kiradi. v3 (SKU darajasi) 1C
// eksportini "collapsing stack" bilan qayta quradi: kod DB kategoriya kodlari
// ichida bo'lsa GROUP (subtotal), aks holda leaf (SKU). Bu suite happy-path,
// qo'sh-hisob validatsiyasi va "fail loud" xatolarni qulflaydi.

/** AOA (array-of-arrays) → xlsx buffer. */
function wb(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, "Sheet1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Bitta filial ("Market MEGA"), to'liq 4 metrika (Остаток|Количество|Продажи[Цена,Сумма]|
// Себестоимость[Цена,Сумма]). Kategoriya kodi 100 — GROUP; 50911/50912 — SKU (leaf).
const V3_AOA: unknown[][] = [
  ["Продажи товаров за период с 01.04.2026 по 30.04.2026", null, null, null, null, null, null, null],
  ["Код", "Номенклатура", "Market MEGA", null, null, null, null, null],
  [null, null, "Остаток", "Количество", "Продажи", null, "Себестоимость", null],
  [null, null, null, null, "Цена", "Сумма", "Цена", "Сумма"],
  [100, "SUV ICHIMLIKLARI", null, null, null, 61000, null, 45000], // GROUP (subtotal)
  [50911, "Coca Cola 1L", 10, 5, 8000, 40000, 6000, 30000], //          leaf
  [50912, "Fanta 1L", 8, 3, 7000, 21000, 5000, 15000], //              leaf
  [50913, "Sprite (sotuvsiz)", 5, 0, 0, 0, 0, 0], //                   leaf, amount=0 → tashlanadi
  ["Итого", null, null, null, null, 61000, null, 45000], //           grand total (validatsiya)
];

describe("parseSalesWorkbook — v3 (SKU darajasi)", () => {
  const res = parseSalesWorkbook(wb(V3_AOA), [], undefined, new Set([100]));

  it("versiya va davr sarlavhadan aniqlanadi", () => {
    expect(res.version).toBe("v3");
    expect(res.periodStart.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(res.periodEnd.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("faqat sotuvi > 0 bo'lgan SKU'lar qator beradi (0 tashlanadi)", () => {
    if (res.version !== "v3") throw new Error("v3 kutilgan");
    expect(res.productRows).toHaveLength(2);
    expect(res.categoryRowCount).toBe(1);
    expect(res.productRows.map((p) => p.productCode).sort()).toEqual([50911, 50912]);
  });

  it("leaf SKU metrikalar va kategoriya biriktirilishi to'g'ri", () => {
    if (res.version !== "v3") throw new Error("v3 kutilgan");
    const coca = res.productRows.find((p) => p.productCode === 50911)!;
    expect(coca).toMatchObject({
      branchAlias: "Market MEGA",
      productName: "Coca Cola 1L",
      parentCategoryCode: 100, // eng yaqin GROUP (collapsing stack)
      stockQty: 10,
      soldQty: 5,
      amount: 40000,
      salePrice: 8000,
      costAmount: 30000,
      costPrice: 6000,
    });
  });
});

describe("parseSalesWorkbook — qo'sh-hisob himoyasi (Итого validatsiyasi)", () => {
  it("GROUP qatori (kod categoryCodes'da) leaf sifatida sanalmaydi — mos keladi", () => {
    // 100 GROUP deb tan olinadi → leafSum=61000=Итого. Xato tashlamaydi.
    expect(() => parseSalesWorkbook(wb(V3_AOA), [], undefined, new Set([100]))).not.toThrow();
  });

  it("GROUP kodi berilmasa (100 leaf bo'lib qoladi) → qo'sh hisob → xato tashlaydi", () => {
    // categoryCodes bo'sh → 100 ham leaf → leafSum=122000 ≠ Итого 61000 → validatsiya yiqiladi.
    expect(() => parseSalesWorkbook(wb(V3_AOA), [], undefined, new Set())).toThrow();
  });
});

describe("parseSalesWorkbook — fail loud (jim noto'g'ri parse emas)", () => {
  it("davr topilmasa xato tashlaydi", () => {
    const aoa = [
      ["Код", "Номенклатура", "Market MEGA"],
      [null, null, "Продажи"],
    ];
    expect(() => parseSalesWorkbook(wb(aoa), [], undefined, new Set())).toThrow(/sana/i);
  });

  it("header (Код | Номенклатура) topilmasa xato tashlaydi", () => {
    const aoa = [
      ["Продажи за период с 01.04.2026 по 30.04.2026"],
      ["foo", "bar", "baz"],
    ];
    expect(() => parseSalesWorkbook(wb(aoa), [], undefined, new Set())).toThrow(/header/i);
  });
});
