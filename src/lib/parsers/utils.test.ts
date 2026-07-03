import { describe, it, expect } from "vitest";
import {
  parseAmount,
  parseCode,
  parseDate,
  parseUzDayMonth,
  parseRussianPeriod,
  normalizeName,
} from "@/lib/parsers/utils";

// Pul/sana parserlari — buzilsa DB'ga noto'g'ri summalar kiradi (jim). Bu suite
// 1C eksportidagi real formatlarni (probelli minglar, vergul, teskari oraliq) qulflaydi.

describe("parseAmount", () => {
  it("probelli o'zbekcha format (vergul — kasr)", () => {
    expect(parseAmount("15 142 029,99")).toBeCloseTo(15142029.99, 2);
  });
  it("inglizcha ming-ajratuvchi (nuqta — minglar, oxirgisi kasr)", () => {
    expect(parseAmount("15,142,029.99")).toBeCloseTo(15142029.99, 2);
  });
  it("oddiy son va number passthrough", () => {
    expect(parseAmount("1000")).toBe(1000);
    expect(parseAmount(2500.5)).toBe(2500.5);
    expect(parseAmount(0)).toBe(0);
  });
  it("bo'sh/null → null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
  it("son bo'lmagan matn va Infinity/NaN → null", () => {
    expect(parseAmount("Итого")).toBeNull();
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount(NaN)).toBeNull();
  });
  it("manfiy qiymat saqlanadi (marja minus bo'lishi mumkin)", () => {
    expect(parseAmount("-1 234,5")).toBeCloseTo(-1234.5, 2);
  });
});

describe("parseCode", () => {
  it("kichik raqam (integer)", () => {
    expect(parseCode(299)).toBe(299);
  });
  it("probelli katta kod (matn)", () => {
    expect(parseCode("50 911")).toBe(50911);
  });
  it("Итого / son bo'lmagan → null", () => {
    expect(parseCode("Итого")).toBeNull();
    expect(parseCode("abc")).toBeNull();
  });
  it("nol / manfiy / kasr → null", () => {
    expect(parseCode(0)).toBeNull();
    expect(parseCode(-5)).toBeNull();
    expect(parseCode(3.5)).toBeNull();
  });
});

describe("parseDate", () => {
  it("DD.MM.YYYY → UTC kun boshi", () => {
    const d = parseDate("01.04.2026");
    expect(d?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("DD/MM/YYYY ham qabul qilinadi", () => {
    const d = parseDate("30/04/2026");
    expect(d?.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });
  it("noto'g'ri format → null", () => {
    expect(parseDate("2026-04-01")).toBeNull();
    expect(parseDate("aprel")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("parseUzDayMonth", () => {
  it("'01 aprel' + yil → UTC sana", () => {
    expect(parseUzDayMonth("01 aprel", 2026)?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("kirill/lotin variant (sentabr/sentyabr)", () => {
    expect(parseUzDayMonth("5 sentyabr", 2026)?.getUTCMonth()).toBe(8);
  });
  it("noma'lum oy → null", () => {
    expect(parseUzDayMonth("1 foobar", 2026)).toBeNull();
  });
});

describe("parseRussianPeriod", () => {
  it("'... с 01.04.2026 по 30.04.2026' → {start,end}", () => {
    const p = parseRussianPeriod("Продажи товаров за период с 01.04.2026 по 30.04.2026");
    expect(p?.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(p?.end.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });
  it("teskari oraliq (start > end) → null (jim 0-summa oldini oladi)", () => {
    expect(parseRussianPeriod("с 30.04.2026 по 01.04.2026")).toBeNull();
  });
  it("mos kelmasa → null", () => {
    expect(parseRussianPeriod("hech qanday sana yo'q")).toBeNull();
  });
});

describe("normalizeName", () => {
  it("trim + katta harf + bir bo'shliqqa qisqartirish", () => {
    expect(normalizeName("  coca   cola  ")).toBe("COCA COLA");
  });
});
