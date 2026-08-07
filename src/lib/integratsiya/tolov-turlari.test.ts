import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { kodNormalla, turXaritasi, toneOf, TONES, TONE_CODES } =
  await import("./tolov-turlari");

const tur = (
  code: string,
  extra: Partial<{ name: string; tone: string }> = {},
) => ({
  code,
  name: extra.name ?? code,
  isCash: false,
  tone: extra.tone ?? "slate",
  sortOrder: 10,
  isSystem: false,
});

describe("kodNormalla", () => {
  it("katta harfga o'giradi va bo'shliqni almashtiradi", () => {
    expect(kodNormalla("payme go")).toBe("PAYME_GO");
  });

  it("harf/raqamdan boshqasini pastki chiziqqa aylantiradi, takrorini yig'adi", () => {
    expect(kodNormalla("payme---go!!!")).toBe("PAYME_GO");
  });

  it("chetdagi pastki chiziqlarni olib tashlaydi", () => {
    expect(kodNormalla("  -payme-  ")).toBe("PAYME");
  });

  it("kirill kabi lotin bo'lmagan harflar pastki chiziqqa tushadi", () => {
    // Kod BARQAROR kalit: faqat A-Z0-9_ bo'lishi kerak, aks holda URL va
    // solishtirishda kutilmagan holatlar chiqadi.
    expect(kodNormalla("Наличные")).toBe("");
  });

  it("30 belgidan uzunini kesadi", () => {
    expect(kodNormalla("A".repeat(50))).toHaveLength(30);
  });

  it("bo'sh kirish — bo'sh natija (chaqiruvchi rad etadi)", () => {
    expect(kodNormalla("   ")).toBe("");
  });
});

describe("turXaritasi", () => {
  const ol = turXaritasi([
    tur("CASH", { name: "Naqd", tone: "green" }),
    tur("CARD"),
  ]);

  it("mavjud kodni topadi", () => {
    expect(ol("CASH").name).toBe("Naqd");
    expect(ol("CASH").tone).toBe("green");
  });

  // Tur o'chirilgan bo'lsa ham eski chekdagi qator YO'QOLMASLIGI kerak.
  it("noma'lum kod uchun kodning o'zini nom qilib qaytaradi", () => {
    const t = ol("PAYME");
    expect(t.code).toBe("PAYME");
    expect(t.name).toBe("PAYME");
    expect(t.tone).toBe("slate");
    expect(t.isCash).toBe(false);
  });
});

describe("toneOf", () => {
  it("mavjud rangni qaytaradi", () => {
    expect(toneOf("blue")).toBe(TONES.blue);
  });

  it("noma'lum rang uchun kulrangga tushadi — UI sinfsiz qolmasin", () => {
    expect(toneOf("nomalum")).toBe(TONES.slate);
    expect(toneOf("")).toBe(TONES.slate);
  });

  it("har bir rangda uchala sinf ham bor", () => {
    for (const c of TONE_CODES) {
      expect(TONES[c].pill).toBeTruthy();
      expect(TONES[c].bar).toBeTruthy();
      expect(TONES[c].on).toBeTruthy();
    }
  });
});
