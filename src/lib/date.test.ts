import { describe, it, expect } from "vitest";
import {
  TASHKENT_OFFSET_MS,
  nowTashkent,
  isoDay,
  todayTashkentISO,
  parseDateParam,
} from "@/lib/date";

describe("isoDay", () => {
  it("UTC kalendar kunini beradi", () => {
    expect(isoDay(new Date("2026-04-15T13:20:00.000Z"))).toBe("2026-04-15");
  });
});

describe("parseDateParam", () => {
  it("to'g'ri sana -> UTC yarim tun", () => {
    expect(parseDateParam("2026-04-01")?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
  it("noto'g'ri format -> fallback", () => {
    const fb = new Date("2026-01-01T00:00:00.000Z");
    expect(parseDateParam("01.04.2026", fb)).toBe(fb);
    expect(parseDateParam("2026-4-1", fb)).toBe(fb); // to'ldirilmagan
    expect(parseDateParam("", fb)).toBe(fb);
    expect(parseDateParam(null, fb)).toBe(fb);
    expect(parseDateParam(undefined)).toBeUndefined();
  });
  it("mavjud bo'lmagan kalendar sana JIM rollover QILINMAYDI (Feb-31, oy 13)", () => {
    expect(parseDateParam("2026-02-31")).toBeUndefined();
    expect(parseDateParam("2026-13-01")).toBeUndefined();
    expect(parseDateParam("2026-00-10")).toBeUndefined();
  });
});

describe("TASHKENT_OFFSET_MS / nowTashkent / todayTashkentISO", () => {
  it("offset = 5 soat", () => {
    expect(TASHKENT_OFFSET_MS).toBe(5 * 3600 * 1000);
  });
  it("nowTashkent UTC epoch'dan roppa-rosa 5 soat oldinda", () => {
    const diff = nowTashkent().getTime() - Date.now();
    expect(diff).toBeGreaterThan(TASHKENT_OFFSET_MS - 2000);
    expect(diff).toBeLessThanOrEqual(TASHKENT_OFFSET_MS + 2000);
  });
  it("todayTashkentISO YYYY-MM-DD formatida", () => {
    expect(todayTashkentISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
