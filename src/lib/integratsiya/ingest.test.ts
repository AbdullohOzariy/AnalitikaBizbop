import { describe, it, expect, beforeEach } from "vitest";
import {
  authTashxis,
  decodeBody,
  extractEvents,
  normalizeEvent,
  parse1cDate,
  parseOpenDateTime,
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

describe("decodeBody — 1C kodlashi", () => {
  // 1C ko'pincha windows-1251 da chiqaradi. req.json() ni ishlatsak kirill
  // matn U+FFFD ga aylanib QAYTARIB BO'LMAYDIGAN holga kelardi — bu haqiqiy
  // holat edi: 1C bergan birinchi namuna faylda 106 ta U+FFFD bor edi.
  const cp1251 = (s: string): Uint8Array => {
    // "Наличные" ni cp1251 baytlariga o'giramiz (А=0xC0 dan boshlanadi)
    const TABLE = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";
    return new Uint8Array(
      [...s].map((ch) => {
        const i = TABLE.indexOf(ch);
        return i >= 0 ? 0xc0 + i : ch.charCodeAt(0);
      })
    );
  };

  it("UTF-8 tanani o'zgartirmasdan o'qiydi", () => {
    const buf = new TextEncoder().encode('{"name":"Наличные"}');
    expect(JSON.parse(decodeBody(buf, "application/json"))).toEqual({ name: "Наличные" });
  });

  it("cp1251 tanani TIKLAB o'qiydi (charset ko'rsatilmagan bo'lsa ham)", () => {
    const buf = cp1251('{"name":"Наличные"}');
    expect(JSON.parse(decodeBody(buf, "application/json"))).toEqual({ name: "Наличные" });
  });

  it("Content-Type dagi charset hurmat qilinadi", () => {
    const buf = cp1251('{"name":"Водка"}');
    expect(JSON.parse(decodeBody(buf, "application/json; charset=windows-1251"))).toEqual({
      name: "Водка",
    });
  });

  it("noma'lum charset berilsa ham avtomatik aniqlashga tushadi", () => {
    const buf = new TextEncoder().encode('{"a":1}');
    expect(JSON.parse(decodeBody(buf, "application/json; charset=allaqanday"))).toEqual({ a: 1 });
  });

  it("ASCII har ikki kodlashda ham bir xil", () => {
    const buf = new TextEncoder().encode('{"a":"test"}');
    expect(decodeBody(buf, null)).toBe('{"a":"test"}');
  });
});

describe("kassa cheki (1C real namunasi)", () => {
  // Haqiqiy fayldan olingan shakl: shop/pos qo'shilgan, type — chek turi raqami.
  const chek = {
    shop: 5,
    pos: 1,
    number: "121",
    openDate: "04.08.26",
    openTime: "16:49:04",
    type: 1,
    status: "success",
    payments: [{ name: "Наличные", value: 68.68 }],
    positions: [{ item: { name: "Водка 0,75" }, qty: 1, sum: 4500 }],
  };

  it("RAQAMLI `type` kind bo'lib ketmaydi", () => {
    // Aks holda barcha cheklar "1" nomli turga yig'ilib, tur filtri foydasiz bo'lardi.
    expect(normalizeEvent(chek).kind).toBe(UNKNOWN_KIND);
  });

  it("matnli tur esa qabul qilinadi", () => {
    expect(normalizeEvent({ ...chek, type: "ЧекККМ" }).kind).toBe("ЧекККМ");
  });

  it("openDate + openTime dan sana o'qiladi", () => {
    expect(normalizeEvent(chek).occurredAt?.toISOString()).toBe("2026-08-04T16:49:04.000Z");
  });

  it("chek raqami externalNo ga tushadi", () => {
    expect(normalizeEvent(chek).externalNo).toBe("121");
  });

  it("shop/pos payloadda saqlanadi (ustki daraja tashlanmaydi)", () => {
    const p = normalizeEvent(chek).payload;
    expect(p.shop).toBe(5);
    expect(p.pos).toBe(1);
  });
});

describe("parseOpenDateTime", () => {
  it("DD.MM.YY + vaqt", () => {
    expect(parseOpenDateTime("04.08.26", "16:49:04")?.toISOString()).toBe("2026-08-04T16:49:04.000Z");
  });

  it("to'rt xonali yil ham ishlaydi", () => {
    expect(parseOpenDateTime("04.08.2026", "10:00")?.toISOString()).toBe("2026-08-04T10:00:00.000Z");
  });

  it("vaqt bo'lmasa kun boshi", () => {
    expect(parseOpenDateTime("04.08.26", null)?.toISOString()).toBe("2026-08-04T00:00:00.000Z");
  });

  it("mavjud bo'lmagan sana JIMGINA surilmaydi", () => {
    expect(parseOpenDateTime("31.02.26", "10:00")).toBeNull();
  });

  it("noto'g'ri format", () => {
    expect(parseOpenDateTime("2026-08-04", "10:00")).toBeNull();
    expect(parseOpenDateTime("", "10:00")).toBeNull();
  });
});

describe("authTashxis", () => {
  const SIR = "s3cr3t-token-abcdefghijklmnop";
  const req = (h: Record<string, string>, url = "http://x/api/1c/ingest", method = "POST") =>
    new Request(url, { method, headers: h });

  beforeEach(() => {
    process.env.ONEC_INGEST_TOKEN = SIR;
  });

  // ENG MUHIM TEKSHIRUV: tashxis jurnalga tushadi, ya'ni token qiymati
  // hech qanday maydonda TO'LIQ ko'rinmasligi kerak.
  it("token qiymatini OSHKOR QILMAYDI", () => {
    const d = authTashxis(req({ authorization: `Bearer ${SIR}` }), "1.2.3.4");
    const matn = JSON.stringify(d);
    expect(matn).not.toContain(SIR);
    expect(matn).not.toContain(SIR.slice(0, 10));
  });

  it("Bearer prefiksi borligini ko'rsatadi", () => {
    expect(authTashxis(req({ authorization: `Bearer ${SIR}` }), "1.2.3.4")).toMatchObject({
      header: "authorization",
      bearerPrefiks: true,
      tokenUzunligi: SIR.length,
    });
  });

  it("prefiks TUSHIB QOLGANINI ajratadi — 404 ning eng ehtimolli sababi", () => {
    expect(authTashxis(req({ authorization: SIR }), "1.2.3.4")).toMatchObject({
      header: "authorization",
      bearerPrefiks: false,
      tokenUzunligi: SIR.length,
    });
  });

  it("token KESILGANINI uzunlik farqidan ko'rsatadi", () => {
    const d = authTashxis(req({ authorization: `Bearer ${SIR.slice(0, 10)}` }), "1.2.3.4");
    expect(d.tokenUzunligi).toBe(10);
    expect(d.kutilganUzunlik).toBe(SIR.length);
  });

  it("header umuman yo'qligini ko'rsatadi", () => {
    expect(authTashxis(req({}), "1.2.3.4")).toMatchObject({
      header: "YO'Q",
      bearerPrefiks: null,
      tokenUzunligi: 0,
    });
  });

  it("muqobil X-Ingest-Token headerini taniydi", () => {
    expect(authTashxis(req({ "x-ingest-token": SIR }), "1.2.3.4")).toMatchObject({
      header: "x-ingest-token",
      bearerPrefiks: null,
    });
  });

  it("yo'l va metodni yozadi — noto'g'ri manzilni ajratish uchun", () => {
    const d = authTashxis(req({}, "http://x/api/1c/Ingest", "POST"), "1.2.3.4");
    expect(d).toMatchObject({ path: "/api/1c/Ingest", method: "POST", ip: "1.2.3.4" });
  });
});
