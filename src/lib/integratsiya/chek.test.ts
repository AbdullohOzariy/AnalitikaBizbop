import { describe, it, expect } from "vitest";
import {
  isChek,
  parseChek,
  tolovTuri,
  chekVaqti,
  hisobotKuni,
  fiskalVaqt,
} from "./chek";

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

describe("tolovTuri — 'нал' bo'lagi tuzoqlari", () => {
  // REGRESSIYA: jonli oqimda "Терминал" NAQD deb tushgan edi (2026-08-07).
  // "Терми-нал" ichida "нал" bor, naqd tekshiruvi oldinroq turgani uchun.
  it("Терминал → CARD (naqd EMAS)", () => {
    expect(tolovTuri("Терминал")).toBe("CARD");
    expect(tolovTuri("терминал")).toBe("CARD");
    expect(tolovTuri("POS-терминал")).toBe("CARD");
  });

  it("Безналичный → TRANSFER (naqd EMAS)", () => {
    expect(tolovTuri("Безналичный")).toBe("TRANSFER");
  });

  it("Наличные → CASH", () => {
    expect(tolovTuri("Наличные")).toBe("CASH");
    expect(tolovTuri("Naqd")).toBe("CASH");
  });

  it("to'lov ilovalari OTHER bo'lib qoladi — buxgalteriya tasdiqlasin", () => {
    for (const n of ["PaymeGo", "Click", "Uzum"]) {
      expect(tolovTuri(n)).toBe("OTHER");
    }
  });
});

describe("parseChek — summalar kelmaganda qatorlardan yig'iladi", () => {
  // Jonli 1C oqimida sarlavhada sum/sumWithDiscs/totalSum YO'Q — barcha cheklar
  // 0 summa bilan tushib qolgan edi (2026-08-07).
  const xom = {
    shop: 1, pos: 5, number: "887929", session: 3813,
    openDate: "07.08.26", openTime: "16:02:03", type: 1, qtyPositions: 2,
    user: { id: 1, name: "admin" },
    payments: [{ name: "Наличные", value: 500 }],
    positions: [
      { qty: 1, sum: 300, sumWD: 280, totalSum: 280, storno: 0, item: { id: 1, name: "A" } },
      { qty: 2, sum: 250, sumWD: 220, totalSum: 220, storno: 0, item: { id: 2, name: "B" } },
    ],
  };

  it("sum va sumWithDiscs qatorlardan yig'iladi", () => {
    const r = parseChek(xom);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.sum).toBe(550);
    expect(r.sumWithDiscs).toBe(500);
  });

  it("totalSum TO'LOVLARDAN olinadi — haqiqatan olingan pul", () => {
    const r = parseChek(xom);
    if ("error" in r) throw new Error("parse xato");
    expect(r.totalSum).toBe(500);
  });

  it("to'lov bo'lmasa qatorlarning totalSum'i ishlatiladi", () => {
    const r = parseChek({ ...xom, payments: [] });
    if ("error" in r) throw new Error("parse xato");
    expect(r.totalSum).toBe(500);
  });

  it("1C summani YUBORSA — uniki ustun (kelajakda maydon qaytsa ishlaydi)", () => {
    const r = parseChek({ ...xom, sum: 999, sumWithDiscs: 888, totalSum: 777 });
    if ("error" in r) throw new Error("parse xato");
    expect([r.sum, r.sumWithDiscs, r.totalSum]).toEqual([999, 888, 777]);
  });

  it("0 qiymat ham HURMAT QILINADI (yig'indi bilan almashtirilmaydi)", () => {
    const r = parseChek({ ...xom, totalSum: 0 });
    if ("error" in r) throw new Error("parse xato");
    expect(r.totalSum).toBe(0);
  });
});

describe("parseChek — storno qatorlar summaga kirmaydi", () => {
  // REGRESSIYA: jonli ma'lumotda chek summasi 2.2% ga shishgan edi — bekor
  // qilingan qatorlar ham qo'shilgani uchun. Stornosiz yig'indi to'lov
  // summasiga aynan teng chiqadi.
  const xom = {
    shop: 1, pos: 5, number: "888137", session: 3980,
    openDate: "07.08.26", openTime: "20:10:00", type: 1,
    user: { id: 1, name: "admin" },
    payments: [{ name: "Терминал", value: 700 }],
    positions: [
      { qty: 1, sum: 500, sumWD: 450, totalSum: 450, storno: 0, item: { id: 1, name: "A" } },
      { qty: 1, sum: 300, sumWD: 250, totalSum: 250, storno: 0, item: { id: 2, name: "B" } },
      // Bekor qilingan — chekda ko'rinadi, lekin summaga kirmaydi
      { qty: 1, sum: 900, sumWD: 900, totalSum: 900, storno: 1, item: { id: 3, name: "BEKOR" } },
    ],
  };

  it("sum faqat faol qatorlardan", () => {
    const r = parseChek(xom);
    if ("error" in r) throw new Error("parse xato");
    expect(r.sum).toBe(800); // 500+300, 900 kirmaydi
  });

  it("sumWithDiscs ham faqat faol qatorlardan", () => {
    const r = parseChek(xom);
    if ("error" in r) throw new Error("parse xato");
    expect(r.sumWithDiscs).toBe(700); // 450+250
  });

  it("storno qatorning O'ZI ro'yxatda qoladi — kassir nima qilgani ko'rinsin", () => {
    const r = parseChek(xom);
    if ("error" in r) throw new Error("parse xato");
    expect(r.lines).toHaveLength(3);
    expect(r.lines[2].storno).toBe(1);
  });

  it("to'lov bo'lmasa totalSum ham faqat faol qatorlardan", () => {
    const r = parseChek({ ...xom, payments: [] });
    if ("error" in r) throw new Error("parse xato");
    expect(r.totalSum).toBe(700); // 450+250, bekor qilingan 900 kirmaydi
  });

  it("hammasi storno bo'lsa — summa 0", () => {
    const r = parseChek({
      ...xom,
      payments: [],
      positions: xom.positions.map((p) => ({ ...p, storno: 1 })),
    });
    if ("error" in r) throw new Error("parse xato");
    expect([r.sum, r.sumWithDiscs, r.totalSum]).toEqual([0, 0, 0]);
  });
});

describe("fiskalVaqt — chek yopilgan payt", () => {
  const F = "https://ofd.soliq.uz/check?t=LG42&r=60914&c=20260807210536&s=372418822107";

  it("`c=` dan sanani ajratadi (Toshkent → UTC)", () => {
    const d = fiskalVaqt(F);
    // 07.08.2026 21:05:36 Toshkent = 16:05:36 UTC
    expect(d?.toISOString()).toBe("2026-08-07T16:05:36.000Z");
  });

  it("oxirgi parametr bo'lsa ham topadi", () => {
    expect(fiskalVaqt("https://x/check?t=1&c=20260807210536")?.toISOString()).toBe(
      "2026-08-07T16:05:36.000Z"
    );
  });

  it("havola yo'q / `c=` yo'q — null", () => {
    expect(fiskalVaqt(null)).toBeNull();
    expect(fiskalVaqt("")).toBeNull();
    expect(fiskalVaqt("https://x/check?t=1&r=2")).toBeNull();
  });

  it("noto'g'ri uzunlik yoki qiymat — null", () => {
    expect(fiskalVaqt("?c=2026080721053")).toBeNull(); // 13 xona
    expect(fiskalVaqt("?c=20261307210536")).toBeNull(); // 13-oy
    expect(fiskalVaqt("?c=20260231210536")).toBeNull(); // 31-fevral
    expect(fiskalVaqt("?c=20260807996536")).toBeNull(); // 99-soat
  });

  // `s=...` ichida ham raqam bor — `c=` bilan adashtirmasin
  it("boshqa parametrdagi raqamni olmaydi", () => {
    expect(fiskalVaqt("https://x/check?s=372418822107372&r=1")).toBeNull();
  });
});

describe("parseChek — closeAt", () => {
  const xom = {
    shop: 1, pos: 3, number: "888096", session: 3980,
    openDate: "07.08.26", openTime: "21:03:42", type: 1,
    user: { id: 1, name: "admin" },
    payments: [{ name: "Терминал", value: 300 }],
    positions: [{ qty: 1, sum: 300, sumWD: 300, totalSum: 300, storno: 0, item: { id: 1, name: "A" } }],
  };

  it("fiskal havoladan yopilish vaqtini oladi", () => {
    const r = parseChek({ ...xom, fiscal: "https://ofd.soliq.uz/check?c=20260807210536" });
    if ("error" in r) throw new Error("parse xato");
    expect(r.closeAt?.toISOString()).toBe("2026-08-07T16:05:36.000Z");
    // 21:03:42 → 21:05:36 = 114 sekund xizmat
    expect((r.closeAt!.getTime() - r.openAt.getTime()) / 1000).toBe(114);
  });

  // Kassa soati noto'g'ri sozlangan bo'lsa "manfiy xizmat vaqti" chiqardi.
  it("ochilishdan OLDINGI vaqtni rad etadi", () => {
    const r = parseChek({ ...xom, fiscal: "https://x/check?c=20260807210000" });
    if ("error" in r) throw new Error("parse xato");
    expect(r.closeAt).toBeNull();
  });

  it("fiskal havola yo'q — closeAt null, chek baribir o'qiladi", () => {
    const r = parseChek(xom);
    if ("error" in r) throw new Error("parse xato");
    expect(r.closeAt).toBeNull();
    expect(r.totalSum).toBe(300);
  });
});
