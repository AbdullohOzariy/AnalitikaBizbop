import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma o'rniga xotiradagi soxta jadval: `ipTekshir` ning YOZISH xatti-harakati
// tekshiriladi, baza emas.
const store = { value: null as string | null };
const upsert = vi.fn(async ({ create, update }: { create?: { value: string }; update?: { value: string } }) => {
  store.value = update?.value ?? create?.value ?? null;
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: async () => (store.value === null ? null : { value: store.value }),
      upsert,
    },
  },
}));

const { ipTekshir, haqiqiyIp } = await import("./ip-cheklov");

beforeEach(() => {
  store.value = null;
  upsert.mockClear();
});

describe("haqiqiyIp", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });

  it("Cloudflare'ning cf-connecting-ip'si ustun", () => {
    expect(
      haqiqiyIp(req({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))
    ).toBe("1.1.1.1");
  });

  it("XFF dan OXIRGI element olinadi (birinchisini mijoz soxtalashtiradi)", () => {
    expect(haqiqiyIp(req({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("hech narsa bo'lmasa unknown", () => {
    expect(haqiqiyIp(req({}))).toBe("unknown");
  });
});

describe("ipTekshir — bo'sh ro'yxat", () => {
  // REGRESSIYA: GET ping ro'yxatni band qilib qo'ygan edi va 1C ning haqiqiy
  // birinchi so'rovi 403 olgan. Ping HECH QACHON yozmasligi kerak.
  it("qabulQil=false (GET ping) — YOZMAYDI", async () => {
    const r = await ipTekshir("5.5.5.5", false);
    expect(r).toEqual({ ok: true, royxatgaOlindi: false });
    expect(upsert).not.toHaveBeenCalled();
    expect(store.value).toBeNull();
  });

  it("standart chaqiruv ham yozmaydi (xavfsiz sukut)", async () => {
    await ipTekshir("5.5.5.5");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("qabulQil=true (POST) — band qiladi", async () => {
    const r = await ipTekshir("5.5.5.5", true);
    expect(r).toEqual({ ok: true, royxatgaOlindi: true });
    expect(store.value).toBe("5.5.5.5");
  });

  it("unknown ni hech qachon band qilmaydi — cheklov mangu ochiq qolmasin", async () => {
    const r = await ipTekshir("unknown", true);
    expect(r).toEqual({ ok: true, royxatgaOlindi: false });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("ipTekshir — to'lgan ro'yxat", () => {
  it("ro'yxatdagi IP o'tadi va qayta yozilmaydi", async () => {
    store.value = "5.5.5.5";
    const r = await ipTekshir("5.5.5.5", true);
    expect(r).toEqual({ ok: true, royxatgaOlindi: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("begona IP rad etiladi", async () => {
    store.value = "5.5.5.5";
    const r = await ipTekshir("9.9.9.9", true);
    expect(r).toEqual({ ok: false, ip: "9.9.9.9", ruxsatEtilgan: ["5.5.5.5"] });
  });

  it("bir nechta IP — vergul bilan, bo'shliqlar e'tiborsiz", async () => {
    store.value = " 5.5.5.5 , 6.6.6.6 ";
    expect((await ipTekshir("6.6.6.6", true)).ok).toBe(true);
    expect((await ipTekshir("7.7.7.7", true)).ok).toBe(false);
  });

  it("ro'yxat to'lganda begona IP uni O'ZGARTIRA olmaydi", async () => {
    store.value = "5.5.5.5";
    await ipTekshir("9.9.9.9", true);
    expect(store.value).toBe("5.5.5.5");
  });
});
