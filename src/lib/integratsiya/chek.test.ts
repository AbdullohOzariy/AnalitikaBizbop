import { describe, it, expect } from "vitest";
import { isChek, parseChek, tolovTuri, chekVaqti, hisobotKuni } from "./chek";

/** 1C bergan HAQIQIY namuna (analitic (1).json, 05.08.2026) — qisqartirilmagan shakl. */
const NAMUNA = {
  shop: 5,
  pos: 1,
  barcode: "12345",
  card: "1234567890",
  openDate: "04.08.26",
  openTime: "16:49:04",
  number: "121",
  user: { id: 1, name: "Системный администратор", text: "Системный администратор" },
  payments: [{ name: "Наличные", value: 68.68 }],
  positions: [
    {
      item: {
        id: 123,
        art: "A123",
        name: "Стейк шейки свиной для барбекю в маринаде",
        class_code: "ГТД 12345",
        package_code: "Certificate1",
      },
      barcode: "46057921",
      qty: 0.723,
      storno: 0,
      sum: 339.09,
      sumR: 0,
      sumWD: 249.49,
      sumWT: 34.23,
      totalSum: 249.49,
    },
    {
      item: { id: 22, art: "A334", name: "Водка 0,75", class_code: "ГТД 22223", package_code: "" },
      barcode: "5010106113127",
      qty: 1,
      storno: 0,
      sum: 4500,
      sumR: 0,
      sumWD: 4500,
      sumWT: 34.23,
      totalSum: 4500,
    },
  ],
  qtyBuys: 4,
  qtyPositions: 3,
  session: 1,
  type: 1,
  status: "success",
  sum: 2839.09,
  sumWithDiscs: 2728.92,
  totalSum: 2728.92,
  aos: {},
  fiscal: "",
};

describe("isChek — shakl bo'yicha aniqlash", () => {
  it("haqiqiy chekni tanaydi", () => {
    expect(isChek(NAMUNA)).toBe(true);
  });

  it("positions/payments bo'lmasa chek emas", () => {
    expect(isChek({ shop: 5, pos: 1, number: "1" })).toBe(false);
    expect(isChek({ ...NAMUNA, payments: undefined })).toBe(false);
  });

  it("obyekt bo'lmagan qiymat", () => {
    expect(isChek(null)).toBe(false);
    expect(isChek("matn")).toBe(false);
  });
});

describe("tolovTuri — naqd/plastik ajratish", () => {
  it("naqd variantlari", () => {
    expect(tolovTuri("Наличные")).toBe("CASH");
    expect(tolovTuri("НАЛИЧНЫЕ")).toBe("CASH");
    expect(tolovTuri("Naqd pul")).toBe("CASH");
  });

  it("plastik variantlari", () => {
    expect(tolovTuri("Карта")).toBe("CARD");
    expect(tolovTuri("Пластик")).toBe("CARD");
    expect(tolovTuri("UzCard")).toBe("CARD");
    expect(tolovTuri("HUMO")).toBe("CARD");
  });

  it("o'tkazma", () => {
    expect(tolovTuri("Перечисление")).toBe("TRANSFER");
  });

  it("«БЕЗналичный» naqd deb hisoblanmaydi", () => {
    // Tuzoq: "безналичный" ichida "нал" bor. Naqdni oldin tekshirsak, naqd
    // BO'LMAGAN to'lov naqd bo'lib ketardi va kassa sverkasi buzilardi.
    expect(tolovTuri("Безналичный")).toBe("TRANSFER");
    expect(tolovTuri("БЕЗНАЛ")).toBe("TRANSFER");
  });

  it("TANILMAGAN nom OTHER bo'ladi — jimgina naqdga qo'shilmaydi", () => {
    // Bu muhim: noma'lum turni naqd deb hisoblasak, kassa sverkasi buzilardi.
    expect(tolovTuri("Sertifikat")).toBe("OTHER");
    expect(tolovTuri("")).toBe("OTHER");
  });
});

describe("chekVaqti — sana/vaqt", () => {
  it("Toshkent vaqti sifatida o'qiladi va UTC ga o'giriladi", () => {
    // 16:49 Toshkent = 11:49 UTC
    expect(chekVaqti("04.08.26", "16:49:04")?.toISOString()).toBe("2026-08-04T11:49:04.000Z");
  });

  it("to'rt xonali yil", () => {
    expect(chekVaqti("04.08.2026", "10:00")?.toISOString()).toBe("2026-08-04T05:00:00.000Z");
  });

  it("mavjud bo'lmagan sana JIMGINA surilmaydi", () => {
    expect(chekVaqti("31.02.26", "10:00")).toBeNull();
  });

  it("noto'g'ri format", () => {
    expect(chekVaqti("2026-08-04", "10:00")).toBeNull();
    expect(chekVaqti(null, "10:00")).toBeNull();
  });
});

describe("hisobotKuni — Toshkent kuni", () => {
  it("kechqurungi chek O'SHA kunga tegishli", () => {
    // 04.08 23:30 Toshkent = 18:30 UTC → hisobot kuni 04.08 (05.08 EMAS)
    const openAt = chekVaqti("04.08.26", "23:30:00")!;
    expect(hisobotKuni(openAt).toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("erta tongdagi chek ham o'sha kunga", () => {
    const openAt = chekVaqti("04.08.26", "00:15:00")!;
    expect(hisobotKuni(openAt).toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });
});

describe("parseChek — haqiqiy namuna", () => {
  const c = parseChek(NAMUNA);
  if ("error" in c) throw new Error(c.error);

  it("sarlavha maydonlari", () => {
    expect(c.shop).toBe(5);
    expect(c.pos).toBe(1);
    expect(c.number).toBe("121");
    expect(c.session).toBe(1);
    expect(c.type).toBe(1);
    expect(c.status).toBe("success");
  });

  it("CHEK shtrix-kodi sarlavhadan olinadi (tovarniki bilan adashtirilmaydi)", () => {
    expect(c.receiptBarcode).toBe("12345");
    expect(c.lines[0].barcode).toBe("46057921"); // bu — nomenklatura shtrix-kodi
  });

  it("kassir", () => {
    expect(c.cashierId).toBe(1);
    expect(c.cashierName).toBe("Системный администратор");
  });

  it("to'lov naqd deb tanildi", () => {
    expect(c.payments).toHaveLength(1);
    expect(c.payments[0].kind).toBe("CASH");
    expect(c.payments[0].name).toBe("Наличные"); // xom nom SAQLANADI
    expect(c.payments[0].value).toBe(68.68);
  });

  it("qatorlar — itemCode nomenklatura kodi", () => {
    expect(c.lines).toHaveLength(2);
    expect(c.lines[0].itemCode).toBe(123);
    expect(c.lines[0].art).toBe("A123");
    expect(c.lines[0].qty).toBe(0.723);
    expect(c.lines[0].classCode).toBe("ГТД 12345");
    expect(c.lines[1].packageCode).toBeNull(); // bo'sh satr → null
  });

  it("lineNo 1 dan boshlanadi (manbada yo'q, biz beramiz)", () => {
    expect(c.lines.map((l) => l.lineNo)).toEqual([1, 2]);
  });

  it("sumR xom holda saqlanadi (ma'nosi noma'lum, talqin qilinmaydi)", () => {
    expect(c.lines[0].sumR).toBe(0);
  });

  it("hisobot kuni Toshkent bo'yicha", () => {
    expect(c.businessDate.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });
});

describe("parseChek — xato holatlar", () => {
  it("shop/pos yo'q", () => {
    const r = parseChek({ ...NAMUNA, shop: undefined, pos: undefined });
    expect(r).toHaveProperty("error");
  });

  it("sana buzuq", () => {
    const r = parseChek({ ...NAMUNA, openDate: "kecha" });
    expect(r).toHaveProperty("error");
  });

  it("chek raqami yo'q", () => {
    const r = parseChek({ ...NAMUNA, number: "" });
    expect(r).toHaveProperty("error");
  });
});
