import { describe, it, expect } from "vitest";
import {
  imzoHisobla,
  imzoTekshir,
  timestampSekund,
  IMZO_OYNA_SEK,
} from "./imzo";

const SECRET = "test-sir-kaliti-1234567890";
const HOZIR = 1_754_400_000; // barqaror "hozir" — test vaqtga bog'lanmasin

const tana = (s: string) => new TextEncoder().encode(s);

/** To'g'ri imzolangan so'rov yig'adi. */
function imzolangan(body: string, ts = String(HOZIR), secret = SECRET) {
  const t = tana(body);
  return { imzo: imzoHisobla(secret, ts, t), vaqt: ts, tana: t };
}

describe("timestampSekund", () => {
  it("unix soniyani o'qiydi", () => {
    expect(timestampSekund("1754400000")).toBe(1_754_400_000);
  });

  it("unix millisekundni soniyaga aylantiradi", () => {
    expect(timestampSekund("1754400000000")).toBe(1_754_400_000);
  });

  it("ISO-8601 ni o'qiydi", () => {
    expect(timestampSekund("2026-08-05T12:00:00Z")).toBe(
      Math.floor(Date.parse("2026-08-05T12:00:00Z") / 1000)
    );
  });

  it("bo'sh va axlat qiymatlarga null", () => {
    for (const v of ["", "   ", null, undefined, "salom", "12:00"]) {
      expect(timestampSekund(v as string)).toBeNull();
    }
  });
});

describe("imzoHisobla", () => {
  it("barqaror — bir xil kirishga bir xil chiqish", () => {
    const a = imzoHisobla(SECRET, "100", tana("{}"));
    const b = imzoHisobla(SECRET, "100", tana("{}"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tana o'zgarsa imzo o'zgaradi", () => {
    expect(imzoHisobla(SECRET, "100", tana('{"a":1}'))).not.toBe(
      imzoHisobla(SECRET, "100", tana('{"a":2}'))
    );
  });

  it("vaqt o'zgarsa imzo o'zgaradi", () => {
    expect(imzoHisobla(SECRET, "100", tana("{}"))).not.toBe(
      imzoHisobla(SECRET, "101", tana("{}"))
    );
  });

  it("sir o'zgarsa imzo o'zgaradi", () => {
    expect(imzoHisobla(SECRET, "100", tana("{}"))).not.toBe(
      imzoHisobla("boshqa-sir", "100", tana("{}"))
    );
  });

  it("kirill (windows-1251) baytlarini imzolaydi — matnga aylantirmasdan", () => {
    // cp1251 da "Наличные" — UTF-8 emas. Xom baytlar bo'yicha imzo ishlashi shart.
    const cp1251 = new Uint8Array([0xcd, 0xe0, 0xeb, 0xe8, 0xf7, 0xed, 0xfb, 0xe5]);
    const imzo = imzoHisobla(SECRET, "100", cp1251);
    expect(imzo).toMatch(/^[0-9a-f]{64}$/);
    expect(
      imzoTekshir({
        secret: SECRET,
        imzo,
        vaqt: "100",
        tana: cp1251,
        talabQilinadi: true,
        hozirSek: 100,
      })
    ).toEqual({ ok: true, holat: "tekshirildi" });
  });
});

describe("imzoTekshir — to'g'ri imzo", () => {
  it("qabul qiladi", () => {
    const s = imzolangan('{"chek":1}');
    expect(
      imzoTekshir({ secret: SECRET, ...s, talabQilinadi: true, hozirSek: HOZIR })
    ).toEqual({ ok: true, holat: "tekshirildi" });
  });

  it("katta harfli hex ham qabul qilinadi", () => {
    const s = imzolangan("{}");
    expect(
      imzoTekshir({
        secret: SECRET,
        ...s,
        imzo: s.imzo.toUpperCase(),
        talabQilinadi: true,
        hozirSek: HOZIR,
      }).ok
    ).toBe(true);
  });

  it("atrofdagi bo'shliq imzoni buzmaydi", () => {
    const s = imzolangan("{}");
    expect(
      imzoTekshir({
        secret: SECRET,
        ...s,
        imzo: `  ${s.imzo}  `,
        talabQilinadi: true,
        hozirSek: HOZIR,
      }).ok
    ).toBe(true);
  });

  it("ISO vaqt bilan ham ishlaydi", () => {
    const iso = new Date(HOZIR * 1000).toISOString();
    const s = imzolangan("{}", iso);
    expect(
      imzoTekshir({ secret: SECRET, ...s, talabQilinadi: true, hozirSek: HOZIR }).ok
    ).toBe(true);
  });
});

describe("imzoTekshir — rad etish", () => {
  it("tana o'zgartirilgan bo'lsa rad etadi", () => {
    const s = imzolangan('{"summa":1000}');
    const buzilgan = tana('{"summa":9000}');
    const r = imzoTekshir({
      secret: SECRET,
      imzo: s.imzo,
      vaqt: s.vaqt,
      tana: buzilgan,
      talabQilinadi: true,
      hozirSek: HOZIR,
    });
    expect(r).toEqual({ ok: false, sabab: "Imzo mos kelmadi." });
  });

  it("boshqa sir bilan imzolangan bo'lsa rad etadi", () => {
    const s = imzolangan("{}", String(HOZIR), "o'g'rilangan-token");
    expect(
      imzoTekshir({ secret: SECRET, ...s, talabQilinadi: true, hozirSek: HOZIR }).ok
    ).toBe(false);
  });

  it("eski so'rovni qayta yuborishni to'xtatadi (replay)", () => {
    const s = imzolangan("{}", String(HOZIR - IMZO_OYNA_SEK - 60));
    const r = imzoTekshir({
      secret: SECRET,
      ...s,
      talabQilinadi: true,
      hozirSek: HOZIR,
    });
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("sabab", expect.stringContaining("Vaqt farqi"));
  });

  it("kelajakdagi vaqtni ham rad etadi", () => {
    const s = imzolangan("{}", String(HOZIR + IMZO_OYNA_SEK + 60));
    expect(
      imzoTekshir({ secret: SECRET, ...s, talabQilinadi: true, hozirSek: HOZIR }).ok
    ).toBe(false);
  });

  it("oyna chegarasida hali qabul qilinadi", () => {
    const s = imzolangan("{}", String(HOZIR - IMZO_OYNA_SEK));
    expect(
      imzoTekshir({ secret: SECRET, ...s, talabQilinadi: true, hozirSek: HOZIR }).ok
    ).toBe(true);
  });

  it("vaqt belgisi yo'q bo'lsa rad etadi", () => {
    const s = imzolangan("{}");
    const r = imzoTekshir({
      secret: SECRET,
      imzo: s.imzo,
      vaqt: null,
      tana: s.tana,
      talabQilinadi: true,
      hozirSek: HOZIR,
    });
    expect(r).toEqual({ ok: false, sabab: "X-Ingest-Timestamp yo'q yoki noto'g'ri." });
  });

  it("imzo kelgan-u, serverda sir yo'q bo'lsa — RAD ETADI (jimgina o'tkazmaydi)", () => {
    const s = imzolangan("{}");
    const r = imzoTekshir({
      secret: undefined,
      ...s,
      talabQilinadi: false,
      hozirSek: HOZIR,
    });
    expect(r.ok).toBe(false);
  });
});

describe("imzoTekshir — o'tish davri", () => {
  it("imzo yo'q va talab qilinmaydi → o'tadi", () => {
    expect(
      imzoTekshir({
        secret: SECRET,
        imzo: null,
        vaqt: null,
        tana: tana("{}"),
        talabQilinadi: false,
        hozirSek: HOZIR,
      })
    ).toEqual({ ok: true, holat: "imzosiz" });
  });

  it("imzo yo'q va talab qilinadi → rad", () => {
    expect(
      imzoTekshir({
        secret: SECRET,
        imzo: "  ",
        vaqt: null,
        tana: tana("{}"),
        talabQilinadi: true,
        hozirSek: HOZIR,
      }).ok
    ).toBe(false);
  });

  it("talab qilinmasa ham NOTO'G'RI imzo o'tkazilmaydi", () => {
    expect(
      imzoTekshir({
        secret: SECRET,
        imzo: "00".repeat(32),
        vaqt: String(HOZIR),
        tana: tana("{}"),
        talabQilinadi: false,
        hozirSek: HOZIR,
      }).ok
    ).toBe(false);
  });
});
