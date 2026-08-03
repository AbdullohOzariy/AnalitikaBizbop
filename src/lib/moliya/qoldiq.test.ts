import { describe, it, expect } from "vitest";
import { pickOpenings, hisobla, ishonchli, type OpeningRow } from "./qoldiq";

const d = (s: string) => new Date(s + "T00:00:00.000Z");

describe("pickOpenings — eng oxirgi sanash tanlanadi", () => {
  const rows: OpeningRow[] = [
    { accountId: 1, onDate: d("2026-01-01"), amount: 100 },
    { accountId: 1, onDate: d("2026-06-01"), amount: 500 },
    { accountId: 2, onDate: d("2026-03-01"), amount: 200 },
  ];

  it("bir necha sanashdan eng kechkisini oladi", () => {
    const m = pickOpenings(rows, d("2026-08-01"));
    expect(m.get(1)?.amount).toBe(500);
  });

  it("asOf dan KEYINGI sanashni hisobga olmaydi", () => {
    // 06-01 dagi sanash 05-01 holatiga tegishli emas — aks holda kelajakdagi
    // inventarizatsiya o'tmishdagi hisobotni o'zgartirib yuborardi.
    const m = pickOpenings(rows, d("2026-05-01"));
    expect(m.get(1)?.amount).toBe(100);
  });

  it("hech qanday sanash bo'lmasa — bo'sh", () => {
    expect(pickOpenings(rows, d("2025-12-01")).size).toBe(0);
  });
});

describe("hisobla", () => {
  it("davr boshi + kirim − chiqim", () => {
    const openings = pickOpenings([{ accountId: 1, onDate: d("2026-08-01"), amount: 1_000_000 }], d("2026-08-31"));
    const [q] = hisobla(
      [1],
      openings,
      [
        { accountId: 1, direction: "IN", amount: 70_000_000 },
        { accountId: 1, direction: "OUT", amount: 12_000_000 },
      ]
    );
    expect(q.qoldiq).toBe(59_000_000);
    expect(q.openingMissing).toBe(false);
  });

  it("davr boshi yo'q — qoldiq yozuvlardan, lekin ISHONCHSIZ deb belgilanadi", () => {
    // Manba jadvaldagi asosiy nuqson shu edi: Офис −30.2 mlrd ko'rsatardi,
    // chunki ochilish qoldig'i ham, juftlanmagan ko'chirishlar ham hisobga olinmagan.
    const [q] = hisobla([1], new Map(), [{ accountId: 1, direction: "OUT", amount: 5_000_000 }]);
    expect(q.qoldiq).toBe(-5_000_000);
    expect(q.openingMissing).toBe(true);
  });

  it("yozuvsiz hisob — davr boshining o'zi", () => {
    const openings = pickOpenings([{ accountId: 7, onDate: d("2026-08-01"), amount: 250_000 }], d("2026-08-05"));
    expect(hisobla([7], openings, [])[0].qoldiq).toBe(250_000);
  });

  it("bir necha hisobni aralashtirmaydi", () => {
    const openings = pickOpenings(
      [
        { accountId: 1, onDate: d("2026-08-01"), amount: 100 },
        { accountId: 2, onDate: d("2026-08-01"), amount: 200 },
      ],
      d("2026-08-05")
    );
    const res = hisobla(
      [1, 2],
      openings,
      [
        { accountId: 1, direction: "IN", amount: 10 },
        { accountId: 2, direction: "OUT", amount: 20 },
      ]
    );
    expect(res.find((r) => r.accountId === 1)!.qoldiq).toBe(110);
    expect(res.find((r) => r.accountId === 2)!.qoldiq).toBe(180);
  });
});

describe("ishonchli", () => {
  const q = { accountId: 1, openingDate: d("2026-08-01"), opening: 0, kirim: 0, chiqim: 0, qoldiq: 0, openingMissing: false };

  it("trustedFrom belgilangan va o'tgan bo'lsa — ishonchli", () => {
    expect(ishonchli(q, d("2026-07-01"), d("2026-08-10"))).toBe(true);
  });

  it("trustedFrom KELAJAKDA bo'lsa — hali ishonchsiz", () => {
    expect(ishonchli(q, d("2026-09-01"), d("2026-08-10"))).toBe(false);
  });

  it("trustedFrom umuman yo'q — ishonchsiz", () => {
    expect(ishonchli(q, null, d("2026-08-10"))).toBe(false);
  });

  it("davr boshi kiritilmagan bo'lsa — trustedFrom bo'lsa ham ishonchsiz", () => {
    expect(ishonchli({ ...q, openingMissing: true }, d("2026-01-01"), d("2026-08-10"))).toBe(false);
  });
});
