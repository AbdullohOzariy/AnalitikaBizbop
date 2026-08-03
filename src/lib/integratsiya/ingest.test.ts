import { describe, it, expect } from "vitest";
import {
  extractEvents,
  normalizeEvent,
  parse1cDate,
  stableHash,
  tokenMatches,
  UNKNOWN_KIND,
} from "./ingest";

describe("extractEvents — so'rov shakli", () => {
  it("bitta obyektni bitta elementli ro'yxatga o'raydi", () => {
    expect(extractEvents({ kind: "ЧекККМ" })).toEqual([{ kind: "ЧекККМ" }]);
  });

  it("massivni o'zgartirmasdan qaytaradi", () => {
    const arr = [{ kind: "A" }, { kind: "B" }];
    expect(extractEvents(arr)).toEqual(arr);
  });

  it("{ events: [...] } o'ramini ochadi", () => {
    expect(extractEvents({ events: [{ kind: "A" }] })).toEqual([{ kind: "A" }]);
  });

  it("ruscha { Документы: [...] } o'ramini ham ochadi", () => {
    expect(extractEvents({ Документы: [{ kind: "A" }] })).toEqual([{ kind: "A" }]);
  });

  it("obyekt ham massiv ham bo'lmasa xato qaytaradi", () => {
    expect(extractEvents("matn")).toHaveProperty("error");
    expect(extractEvents(42)).toHaveProperty("error");
    expect(extractEvents(null)).toHaveProperty("error");
  });
});

describe("normalizeEvent — maydon aniqlash", () => {
  it("1C OData nomlarini tanaydi (Ref_Key, Номер, Дата)", () => {
    const e = normalizeEvent({
      kind: "ПоступлениеТоваровУслуг",
      Ref_Key: "a1b2-c3",
      Номер: "ПТУ-000123",
      Дата: "2026-08-03T10:22:00",
      data: { sum: 100 },
    });
    expect(e.kind).toBe("ПоступлениеТоваровУслуг");
    expect(e.externalId).toBe("a1b2-c3");
    expect(e.externalNo).toBe("ПТУ-000123");
    expect(e.occurredAt?.toISOString()).toBe("2026-08-03T10:22:00.000Z");
  });

  it("tur ko'rsatilmasa RAD ETMAYDI — UNKNOWN bo'lib saqlanadi", () => {
    // Eng muhim xulq: sxema kelishuvi davomida noma'lum shakl kelsa ham
    // ma'lumot yo'qolmasligi kerak.
    const e = normalizeEvent({ nimadir: 1 });
    expect(e.kind).toBe(UNKNOWN_KIND);
    expect(e.externalId).toBeNull();
    expect(e.payload).toEqual({ nimadir: 1 });
  });

  it("payload TO'LIQ obyekt bo'ladi, faqat `data` emas", () => {
    const e = normalizeEvent({ kind: "A", ustki: "maydon", data: { ich: 1 } });
    expect(e.payload).toEqual({ kind: "A", ustki: "maydon", data: { ich: 1 } });
  });

  it("raqamli hujjat raqamini ham matnga keltiradi", () => {
    expect(normalizeEvent({ kind: "A", number: 123 }).externalNo).toBe("123");
  });
});

describe("parse1cDate", () => {
  it("zonasiz sanani UTC deb o'qiydi (server zonasidan qat'i nazar)", () => {
    expect(parse1cDate("2026-08-03T10:22:00")?.toISOString()).toBe("2026-08-03T10:22:00.000Z");
  });

  it("bo'sh joyli ajratgichni ham qabul qiladi", () => {
    expect(parse1cDate("2026-08-03 10:22:00")?.toISOString()).toBe("2026-08-03T10:22:00.000Z");
  });

  it("zona ko'rsatilgan bo'lsa uni hurmat qiladi", () => {
    expect(parse1cDate("2026-08-03T10:22:00+05:00")?.toISOString()).toBe("2026-08-03T05:22:00.000Z");
  });

  it("1C ning bo'sh sanasini (0001-01-01) null deb hisoblaydi", () => {
    expect(parse1cDate("0001-01-01T00:00:00")).toBeNull();
  });

  it("noto'g'ri qiymatlarda null", () => {
    expect(parse1cDate("")).toBeNull();
    expect(parse1cDate(null)).toBeNull();
    expect(parse1cDate("kecha")).toBeNull();
  });
});

describe("stableHash — idempotentlik asosi", () => {
  it("kalitlar tartibi o'zgarsa ham hash BIR XIL", () => {
    // 1C JSON kalit tartibini kafolatlamaydi; tartibga bog'liq hash bo'lsa
    // bir xil hujjat ikki marta yozilib qolardi.
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it("ichma-ich obyektlarda ham tartibga bog'liq emas", () => {
    expect(stableHash({ x: { p: 1, q: 2 } })).toBe(stableHash({ x: { q: 2, p: 1 } }));
  });

  it("massiv tartibi esa MUHIM (qatorlar tartibi ma'noli)", () => {
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
  });

  it("qiymat o'zgarsa hash o'zgaradi", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });
});

describe("tokenMatches", () => {
  it("mos tokenda true", () => {
    expect(tokenMatches("s3cret", "s3cret")).toBe(true);
  });

  it("nomos yoki uzunligi boshqa tokenda false", () => {
    expect(tokenMatches("s3cret", "boshqa")).toBe(false);
    expect(tokenMatches("qisqa", "ancha-uzun-token")).toBe(false);
  });

  it("kutilgan token sozlanmagan bo'lsa har doim false", () => {
    // Aks holda ONEC_INGEST_TOKEN unutilsa endpoint hammaga ochiq qolardi.
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches("nimadir", "")).toBe(false);
  });
});
