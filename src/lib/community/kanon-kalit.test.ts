import { describe, it, expect } from "vitest";
import { canonKey, fuzzyKey, kanonNom } from "./kanon-kalit";

/**
 * Bu testlar DB kontraktini muzlatadi: `TgCanonProduct.nameKey` UNIQUE indeksi
 * `canonKey()` natijasini saqlaydi. Test yiqilsa — bazadagi kalitlar bilan mos
 * kelmay qolgan degani, ya'ni kanonlar dublikatlana boshlaydi.
 */
describe("canonKey — qat'iy unikallik kaliti", () => {
  it("registr va ortiqcha bo'shliq farqini yo'qotadi", () => {
    expect(canonKey("Shaftoli")).toBe("shaftoli");
    expect(canonKey("SHAFTOLI")).toBe("shaftoli");
    expect(canonKey("  shaftoli  ")).toBe("shaftoli");
    expect(canonKey("qora   uzum")).toBe("qora uzum");
  });

  it("kirillni lotinga o'giradi — bir mahsulot bitta kalit", () => {
    expect(canonKey("шафтоли")).toBe("shaftoli");
    expect(canonKey("Персик")).toBe("persik");
    expect(canonKey("Тарвуз")).toBe("tarvuz");
    expect(canonKey("КАРТОШКА")).toBe("kartoshka");
  });

  it("apostrofning barcha ko'rinishini bir xil qiladi", () => {
    const kutilgan = "bogirsoq";
    expect(canonKey("bo'g'irsoq")).toBe(kutilgan);
    expect(canonKey("bo‘g‘irsoq")).toBe(kutilgan);
    expect(canonKey("boʻgʻirsoq")).toBe(kutilgan);
    expect(canonKey("bogirsoq")).toBe(kutilgan);
  });

  it("tinish belgilarini bo'shliqqa aylantiradi", () => {
    expect(canonKey("sut-qatiq")).toBe("sut qatiq");
    expect(canonKey('"Mazzona" testo')).toBe("mazzona testo");
  });

  it("TURLI mahsulotlarni birlashtirib yubormaydi", () => {
    expect(canonKey("Shaftoli")).not.toBe(canonKey("Persik"));
    expect(canonKey("Sut")).not.toBe(canonKey("Sutli"));
  });

  it("bo'sh/yaroqsiz kiritmada bo'sh satr qaytaradi", () => {
    expect(canonKey("")).toBe("");
    expect(canonKey("   ")).toBe("");
    expect(canonKey("!!!")).toBe("");
  });
});

describe("fuzzyKey — yumshoq qidiruv kaliti", () => {
  it("o'lchov va miqdorni tashlaydi", () => {
    expect(fuzzyKey("Shaftoli 1kg")).toBe("shaftoli");
    expect(fuzzyKey("shaftoli 500 gr")).toBe("shaftoli");
    expect(fuzzyKey("Tarvuz 2 dona")).toBe("tarvuz");
  });

  it("ko'plik/kelishik qo'shimchalarini tashlaydi", () => {
    expect(fuzzyKey("shaftolilar")).toBe("shaftoli");
    expect(fuzzyKey("Tarvuzlar")).toBe("tarvuz");
  });

  it("kirill variantini ham bir joyga keltiradi", () => {
    expect(fuzzyKey("шафтоли 1кг")).toBe("shaftoli");
  });
});

describe("kanonNom — ko'rsatiladigan nom uslubi", () => {
  it("faqat birinchi harfni katta qiladi", () => {
    expect(kanonNom("SHAFTOLI")).toBe("Shaftoli");
    expect(kanonNom("qora uzum")).toBe("Qora uzum");
    expect(kanonNom("  Somsa   xamiri ")).toBe("Somsa xamiri");
  });

  it("bo'sh kiritmada bo'sh satr", () => {
    expect(kanonNom("")).toBe("");
  });
});
