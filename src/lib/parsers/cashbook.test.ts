import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCashbook, parseCashDate, isOstatka, directionsOf } from "./cashbook";

/**
 * Sintetik fayl — manba "Касса-Асосий" varag'ining AYNAN tuzilishida:
 * sarlavhadan yuqorida jami qatori, keyin sarlavha, keyin yozuvlar.
 */
function xlsx(rows: unknown[][], sheetName = "Касса"): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const HEADER = [
  "Сана",
  "Касса",
  "Кимдан олинган ёки кимга берилган",
  "Контрагент",
  "Изоҳ",
  "Статья ДДС",
  "Кирим",
  "Чиқим",
  "Қолдиқ",
];

// Jami qatori: Кирим/Чиқим ustunlari o'rnida (6 va 7-indeks)
const TOTALS = [null, null, null, null, null, null, 100_000, 30_000, 70_000];

function namunaviyFayl() {
  return xlsx([
    TOTALS,
    HEADER,
    ["28.02.2026", "Мега маркет", "", "", "", "Остатка", 5_000, null, 5_000],
    ["01.03.2026", "Мега маркет", "", "", "2-смена", "Савдо тушуми MEGA Market", 70_000, null, 75_000],
    ["01.03.2026", "Голд маркет", "Нодир Хамидов", "", "", "Иш хаки харажатлари", null, 30_000, 45_000],
    ["01.03.2026", "Мега маркет", "Акбар ака", "Гуштчи", "Ун", "Таьминотчига тулов", 25_000, null, 70_000],
  ]);
}

describe("parseCashbook — tuzilma", () => {
  it("varaqni va sarlavhani topadi", () => {
    const r = parseCashbook(namunaviyFayl());
    expect(r.sheetName).toBe("Касса");
    expect(r.rows).toHaveLength(4);
  });

  it("ustunlarni to'g'ri o'qiydi", () => {
    const r = parseCashbook(namunaviyFayl());
    const row = r.rows[2]; // Голд маркет, ish haqi
    expect(row.rawDesk).toBe("Голд маркет");
    expect(row.rawPerson).toBe("Нодир Хамидов");
    expect(row.rawArticle).toBe("Иш хаки харажатлари");
    expect(row.amountOut).toBe(30_000);
    expect(row.amountIn).toBeNull();
    expect(row.date?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("kontragent va izohni ajratadi", () => {
    const r = parseCashbook(namunaviyFayl());
    const row = r.rows[3];
    expect(row.rawCounterparty).toBe("Гуштчи");
    expect(row.rawNote).toBe("Ун");
  });

  it("manba jami qatorini (checksum) topadi", () => {
    const r = parseCashbook(namunaviyFayl());
    expect(r.sourceSumIn).toBe(100_000);
    expect(r.sourceSumOut).toBe(30_000);
  });

  it("o'zi hisoblagan jami manba bilan mos keladi", () => {
    const r = parseCashbook(namunaviyFayl());
    // 5 000 + 70 000 + 25 000 = 100 000 · chiqim 30 000
    expect(r.parsedSumIn).toBe(100_000);
    expect(r.parsedSumOut).toBe(30_000);
  });

  it("bo'sh qatorlarni o'tkazib yuboradi", () => {
    const buf = xlsx([
      TOTALS,
      HEADER,
      ["01.03.2026", "Мега маркет", "", "", "", "Савдо тушуми MEGA Market", 70_000, null, 70_000],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
    ]);
    expect(parseCashbook(buf).rows).toHaveLength(1);
  });

  it("sarlavha topilmasa tushunarli xato beradi", () => {
    const buf = xlsx([["allaqanday", "boshqa", "jadval"], [1, 2, 3]]);
    expect(() => parseCashbook(buf)).toThrow(/topilmadi/i);
  });
});

describe("parseCashbook — qoldiq izchilligi", () => {
  it("prev + kirim − chiqim = qoldiq buzilsa qatorni belgilaydi", () => {
    const buf = xlsx([
      TOTALS,
      HEADER,
      ["01.03.2026", "Мега маркет", "", "", "", "Савдо тушуми MEGA Market", 70_000, null, 70_000],
      // 70 000 − 10 000 = 60 000 bo'lishi kerak, lekin 55 000 yozilgan
      ["01.03.2026", "Мега маркет", "", "", "", "Бошка харажатлар", null, 10_000, 55_000],
    ]);
    expect(parseCashbook(buf).balanceBreaks).toHaveLength(1);
  });

  it("izchil bo'lsa hech narsa belgilanmaydi", () => {
    expect(parseCashbook(namunaviyFayl()).balanceBreaks).toHaveLength(0);
  });
});

describe("parseCashDate", () => {
  it("DD.MM.YYYY", () => {
    expect(parseCashDate("03.08.2026")?.toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("Excel serial raqami", () => {
    // 46237 ≈ 2026-08-03 (1900 tizimi)
    const d = parseCashDate(46237);
    expect(d?.getUTCFullYear()).toBe(2026);
  });

  it("mavjud bo'lmagan sana JIMGINA surilmaydi", () => {
    // "31.02" ni Date avtomatik 03.03 ga surib yuborardi — bu jim xato bo'lardi
    expect(parseCashDate("31.02.2026")).toBeNull();
  });

  it("bo'sh yoki noto'g'ri qiymat", () => {
    expect(parseCashDate("")).toBeNull();
    expect(parseCashDate(null)).toBeNull();
    expect(parseCashDate("kecha")).toBeNull();
  });
});

describe("isOstatka", () => {
  it("davr boshi moddasini tanaydi", () => {
    expect(isOstatka("Остатка")).toBe(true);
    expect(isOstatka("  остаток ")).toBe(true);
  });
  it("boshqa moddalar emas", () => {
    expect(isOstatka("Касса колдик")).toBe(false);
    expect(isOstatka("Иш хаки харажатлари")).toBe(false);
  });
});

describe("directionsOf", () => {
  const bosh = {
    rowNo: 1, rawDate: "", date: null, rawDesk: "", rawPerson: "",
    rawCounterparty: "", rawNote: "", rawArticle: "", rawBalance: null,
  };

  it("faqat kirim", () => {
    expect(directionsOf({ ...bosh, amountIn: 100, amountOut: null })).toEqual(["IN"]);
  });

  it("faqat chiqim", () => {
    expect(directionsOf({ ...bosh, amountIn: null, amountOut: 100 })).toEqual(["OUT"]);
  });

  it("IKKALASI ham — netting, ikki yozuv chiqadi", () => {
    // Manbada shunday qatorlar bor edi (03.03 Маззона 2 350 000 / 2 350 000).
    // Bittasini tashlab yuborsak aylanma noto'g'ri bo'lardi.
    expect(directionsOf({ ...bosh, amountIn: 100, amountOut: 100 })).toEqual(["IN", "OUT"]);
  });

  it("ikkalasi ham bo'sh — yozuv yo'q", () => {
    expect(directionsOf({ ...bosh, amountIn: null, amountOut: 0 })).toEqual([]);
  });
});
