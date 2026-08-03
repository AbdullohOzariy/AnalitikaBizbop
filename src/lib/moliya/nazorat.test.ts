import { describe, it, expect } from "vitest";
import { signallar } from "./nazorat";

const bosh = {
  yopilmagan: [],
  kamomad: [],
  yirikKontragentsiz: [],
  podotchyot: [],
  qoldiqlar: [],
};

describe("signallar — yopilmagan kunlar", () => {
  it("chegaradan kam kechikish signal BERMAYDI", () => {
    const s = signallar({ ...bosh, yopilmagan: [{ accountId: 1, name: "Мега", kunlar: 1 }] });
    expect(s).toHaveLength(0);
  });

  it("chegaradan oshsa signal beradi", () => {
    const s = signallar({ ...bosh, yopilmagan: [{ accountId: 1, name: "Мега", kunlar: 3 }] });
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe("yopilmagan");
  });

  it("uzoq kechikish YUQORI darajaga ko'tariladi", () => {
    const s = signallar({ ...bosh, yopilmagan: [{ accountId: 1, name: "Мега", kunlar: 6 }] });
    expect(s[0].severity).toBe("yuqori");
  });
});

describe("signallar — kamomad", () => {
  it("yirik kamomad yuqori daraja", () => {
    const s = signallar({
      ...bosh,
      kamomad: [{ accountId: 1, name: "Мега", onDate: "2026-08-03", diff: -1_500_000 }],
    });
    expect(s[0].severity).toBe("yuqori");
    expect(s[0].title).toContain("kamomad");
  });

  it("ortiqcha ham signal beradi (kamomad emas deb yozadi)", () => {
    const s = signallar({
      ...bosh,
      kamomad: [{ accountId: 1, name: "Мега", onDate: "2026-08-03", diff: 200_000 }],
    });
    expect(s[0].title).toContain("ortiqcha");
  });
});

describe("signallar — hisobdor shaxs (podotchyot)", () => {
  it("ochiq qoldiq nol yoki manfiy bo'lsa signal yo'q", () => {
    const s = signallar({
      ...bosh,
      podotchyot: [{ id: 1, name: "Gulchehra", ochiq: 0, oxirgiKun: 30 }],
    });
    expect(s).toHaveLength(0);
  });

  it("eskirgan ochiq qoldiq YUQORI daraja", () => {
    // Manbadagi asosiy muammo: 424 mln podotchyot hech kim kuzatmasdan turardi.
    const s = signallar({
      ...bosh,
      podotchyot: [{ id: 1, name: "Gulchehra", ochiq: 115_000_000, oxirgiKun: 20 }],
    });
    expect(s[0].severity).toBe("yuqori");
    expect(s[0].detail).toContain("hisobot berilmagan");
  });

  it("yangi qoldiq past daraja", () => {
    const s = signallar({
      ...bosh,
      podotchyot: [{ id: 1, name: "Gulchehra", ochiq: 5_000_000, oxirgiKun: 1 }],
    });
    expect(s[0].severity).toBe("past");
  });
});

describe("signallar — qoldiq holati", () => {
  it("manfiy qoldiq har doim YUQORI va sababini aytadi", () => {
    const s = signallar({
      ...bosh,
      qoldiqlar: [{ accountId: 1, name: "Офис", qoldiq: -30_000_000, openingMissing: true }],
    });
    expect(s[0].severity).toBe("yuqori");
    expect(s[0].detail).toContain("Davr boshi");
  });

  it("musbat lekin davr boshisiz — past daraja", () => {
    const s = signallar({
      ...bosh,
      qoldiqlar: [{ accountId: 1, name: "Bank", qoldiq: 50_000_000, openingMissing: true }],
    });
    expect(s[0].kind).toBe("davr-boshi-yoq");
    expect(s[0].severity).toBe("past");
  });

  it("musbat va davr boshi bor — signal YO'Q", () => {
    const s = signallar({
      ...bosh,
      qoldiqlar: [{ accountId: 1, name: "Мега", qoldiq: 13_000_000, openingMissing: false }],
    });
    expect(s).toHaveLength(0);
  });
});

describe("signallar — tartiblash", () => {
  it("yuqori daraja birinchi chiqadi", () => {
    const s = signallar({
      ...bosh,
      podotchyot: [{ id: 1, name: "A", ochiq: 1000, oxirgiKun: 1 }], // past
      qoldiqlar: [{ accountId: 1, name: "B", qoldiq: -1, openingMissing: false }], // yuqori
    });
    expect(s[0].severity).toBe("yuqori");
    expect(s[1].severity).toBe("past");
  });
});
