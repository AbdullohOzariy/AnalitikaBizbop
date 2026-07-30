import { describe, it, expect } from "vitest";
import { haftaBoshi, haftaQosh, haftaFarq, kutilganOrigin, haftaDate } from "./hafta";
import { modelniTanla } from "./model";
import { segmentla, ishonchBelgisi, HAMMASI, type BahoQatori } from "./segment";
import { scoreCell, wape } from "./metrics";
import type { Sinf } from "./panel";

// 2026-07-27 — DUSHANBA (iyul 2026 kalendari: 6, 13, 20, 27 dushanbalar).
describe("hafta arifmetikasi", () => {
  it("hafta boshi = dushanba", () => {
    expect(haftaBoshi("2026-07-27")).toBe("2026-07-27"); // dushanbaning o'zi
    expect(haftaBoshi("2026-07-30")).toBe("2026-07-27"); // payshanba
    expect(haftaBoshi("2026-08-02")).toBe("2026-07-27"); // YAKSHANBA — ayni haftada qoladi
    expect(haftaBoshi("2026-08-03")).toBe("2026-08-03"); // keyingi dushanba
  });

  it("yakshanba keyingi haftaga O'TMAYDI (Postgres date_trunc('week') bilan bir xil)", () => {
    // Bu eng ko'p uchraydigan xato: AQSh konvensiyasida hafta yakshanbadan boshlanadi,
    // Postgres esa ISO-8601 (dushanba). Ikkisi aralashsa prognoz haftasi 1 kunga siljiydi.
    expect(haftaBoshi("2026-08-02")).not.toBe("2026-08-02");
  });

  it("hafta qo'shish/ayirish", () => {
    expect(haftaQosh("2026-07-27", 4)).toBe("2026-08-24");
    expect(haftaQosh("2026-07-27", -1)).toBe("2026-07-20");
    expect(haftaQosh("2026-07-27", 0)).toBe("2026-07-27");
  });

  it("yil chegarasidan o'tadi", () => {
    expect(haftaQosh("2025-12-29", 1)).toBe("2026-01-05");
    expect(haftaFarq("2025-12-29", "2026-01-26")).toBe(4);
  });

  it("haftaFarq ishorasi: kelajak musbat", () => {
    expect(haftaFarq("2026-07-06", "2026-07-27")).toBe(3);
    expect(haftaFarq("2026-07-27", "2026-07-06")).toBe(-3);
  });

  it("kutilgan origin — o'tgan hafta (joriy hafta chala, origin bo'lolmaydi)", () => {
    // Payshanba 2026-07-30 → joriy hafta 07-27 → origin 07-20
    expect(kutilganOrigin(new Date("2026-07-30T12:00:00Z"))).toBe("2026-07-20");
    // Dushanba ertalab ham — o'tgan hafta
    expect(kutilganOrigin(new Date("2026-07-27T05:00:00Z"))).toBe("2026-07-20");
  });

  it("noto'g'ri sana JIM o'tmaydi", () => {
    expect(() => haftaBoshi("2026-02-31")).toThrow(); // mavjud bo'lmagan kun
    expect(() => haftaQosh("kecha", 1)).toThrow();
  });

  it("haftaDate — UTC yarim tun (@db.Date uchun)", () => {
    expect(haftaDate("2026-07-27").toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });
});

describe("modelniTanla — sinf darvozasi", () => {
  it("darvoza o'tgan sinflar combo50 oladi", () => {
    expect(modelniTanla("SMOOTH")).toBe("combo50");
    expect(modelniTanla("ERRATIC")).toBe("combo50");
    expect(modelniTanla("INTERMITTENT")).toBe("combo50");
  });

  it("LUMPY (FVA +0.9% — shovqin) naive1'da qoladi", () => {
    expect(modelniTanla("LUMPY")).toBe("naive1");
  });

  it("KAM sinf naive1 (baribir prognoz yozilmaydi)", () => {
    expect(modelniTanla("KAM")).toBe("naive1");
  });
});

describe("ishonch belgisi", () => {
  it("chegaralar inklyuziv", () => {
    expect(ishonchBelgisi(0)).toBe("ISHONCHLI");
    expect(ishonchBelgisi(0.3)).toBe("ISHONCHLI");
    expect(ishonchBelgisi(0.3001)).toBe("TAXMINIY");
    expect(ishonchBelgisi(0.6)).toBe("TAXMINIY");
    expect(ishonchBelgisi(0.61)).toBe("ISHONCHSIZ");
    expect(ishonchBelgisi(5)).toBe("ISHONCHSIZ");
  });

  it("o'lchanmagan (fakt yo'q) — null, 'ishonchli' EMAS", () => {
    expect(ishonchBelgisi(null)).toBeNull();
  });
});

describe("segmentla — kesimlar", () => {
  const q = (o: Partial<BahoQatori> & { actual: number; model: number; naive: number }): BahoQatori => ({
    sinf: "SMOOTH" as Sinf,
    branchId: 1,
    katId: 10,
    subkatId: 100,
    abc: "A",
    ishonch: null,
    ...o,
    acc: scoreCell(o.actual, o.model, o.naive, 1),
  });

  it("bitta seriya 6 kesimga tushadi", () => {
    const s = segmentla([q({ actual: 10, model: 9, naive: 12 })]);
    expect(s.map((x) => x.scope).sort()).toEqual(["ABC", "ALL", "BRANCH", "KAT", "SINF", "SUBKAT"]);
    expect(s.find((x) => x.scope === "ALL")!.key).toBe(HAMMASI);
  });

  it("kategoriyasiz SKU kategoriya kesimiga KIRMAYDI (soxta 'null' guruh yaratmaydi)", () => {
    const s = segmentla([q({ actual: 10, model: 9, naive: 12, katId: null, subkatId: null, abc: null })]);
    expect(s.map((x) => x.scope).sort()).toEqual(["ALL", "BRANCH", "SINF"]);
  });

  it("yig'indilar to'planadi, WAPE o'qishda hisoblanadi", () => {
    const rows = [
      q({ actual: 1, model: 2, naive: 1 }), // |1−2| = 1
      q({ actual: 1000, model: 1010, naive: 1000 }), // |1000−1010| = 10
    ];
    const all = segmentla(rows).find((x) => x.scope === "ALL")!;
    expect(all.seriya).toBe(2);
    expect(all.acc.actual).toBe(1001);
    expect(all.acc.absErr).toBe(11);
    // Agregat WAPE = 11/1001 ≈ 1.1%, seriya-o'rtachasi esa 50.5% — aralashtirilmasin
    expect(wape(all.acc)!).toBeCloseTo(11 / 1001, 5);
  });

  it("filial bo'yicha ajratadi, sinf bo'yicha birlashtiradi", () => {
    const rows = [
      q({ actual: 10, model: 10, naive: 10, branchId: 1 }),
      q({ actual: 20, model: 20, naive: 20, branchId: 2 }),
    ];
    const s = segmentla(rows);
    expect(s.filter((x) => x.scope === "BRANCH")).toHaveLength(2);
    const sinf = s.find((x) => x.scope === "SINF")!;
    expect(sinf.seriya).toBe(2);
    expect(sinf.acc.actual).toBe(30);
  });

  it("ishonch sanoqchilari kesim bo'yicha yig'iladi", () => {
    const rows = [
      q({ actual: 10, model: 10, naive: 10, ishonch: "ISHONCHLI" }),
      q({ actual: 10, model: 10, naive: 10, ishonch: "ISHONCHSIZ" }),
      q({ actual: 10, model: 10, naive: 10, ishonch: null }), // hali tarix yo'q
    ];
    const all = segmentla(rows).find((x) => x.scope === "ALL")!;
    expect([all.ishonchli, all.taxminiy, all.ishonchsiz]).toEqual([1, 0, 1]);
    expect(all.seriya).toBe(3); // belgisi yo'q seriya ham seriya sifatida sanaladi
  });
});
