import { describe, it, expect } from "vitest";
import {
  hasRole,
  isSystemAdmin,
  isAdminTier,
  canSeeAnalytics,
  canManageOrders,
  ordersScopedToOwn,
  canReviewAnketa,
  canSeeSuppliers,
  canEditSuppliers,
  canSeePme,
  canEditPme,
  canManageWarehouse,
  canSeeAnalyze,
  canSeePromo,
  canEditPromo,
  canSeeChiqim,
  canSeeSverka,
  isMerchandiser,
  isOperator,
} from "@/lib/roles";

// Rol modeli — xavfsizlikning markazi. Har bir action shu predikatlarga tayanadi;
// bu yerdagi matritsa "izolatsiya" va "read-only ADMIN" kafolatlarini qulflaydi.

describe("hasRole", () => {
  it("bitta rol string bilan ishlaydi", () => {
    expect(hasRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasRole("ADMIN", "SYSTEM_ADMIN")).toBe(false);
  });
  it("rollar massivi bilan union (bittasi mos kelsa true)", () => {
    expect(hasRole(["CAT_MANAGER", "OPERATOR"], "OPERATOR")).toBe(true);
    expect(hasRole(["CAT_MANAGER", "OPERATOR"], "SYSTEM_ADMIN")).toBe(false);
  });
  it("null/undefined/bo'sh — hech qachon true emas", () => {
    expect(hasRole(null, "ADMIN")).toBe(false);
    expect(hasRole(undefined, "ADMIN")).toBe(false);
    expect(hasRole([null, undefined], "ADMIN")).toBe(false);
    expect(hasRole([], "ADMIN")).toBe(false);
  });
});

describe("SYSTEM_ADMIN — to'liq huquq", () => {
  const r = "SYSTEM_ADMIN";
  it("hamma ko'rish va tahrir predikatidan o'tadi", () => {
    for (const pred of [
      isSystemAdmin, isAdminTier, canSeeAnalytics, canManageOrders, canReviewAnketa,
      canSeeSuppliers, canEditSuppliers, canSeePme, canEditPme, canManageWarehouse,
      canSeeAnalyze, canSeePromo, canEditPromo, canSeeChiqim, canSeeSverka,
    ]) {
      expect(pred(r), pred.name).toBe(true);
    }
  });
  it("o'zi bo'yicha zakaz cheklovi yo'q", () => {
    expect(ordersScopedToOwn(r)).toBe(false);
  });
});

describe("ADMIN — read-only (ko'radi, o'zgartira olmaydi)", () => {
  const r = "ADMIN";
  it("ko'rish predikatlaridan o'tadi", () => {
    expect(isAdminTier(r)).toBe(true);
    expect(canSeeAnalytics(r)).toBe(true);
    expect(canSeeSuppliers(r)).toBe(true);
    expect(canSeePme(r)).toBe(true);
    expect(canSeeAnalyze(r)).toBe(true);
    expect(canSeePromo(r)).toBe(true);
    expect(canSeeChiqim(r)).toBe(true);
    expect(canSeeSverka(r)).toBe(true);
    expect(canReviewAnketa(r)).toBe(true); // anketa tasdiqlash — ataylab
  });
  it("tahrir/boshqaruv predikatlaridan O'TMAYDI", () => {
    expect(isSystemAdmin(r)).toBe(false);
    expect(canEditSuppliers(r)).toBe(false);
    expect(canEditPme(r)).toBe(false);
    expect(canManageWarehouse(r)).toBe(false);
    expect(canEditPromo(r)).toBe(false);
    expect(canManageOrders(r)).toBe(false);
  });
});

describe("MERCHANDISER — izolatsiyalangan (faqat Promo)", () => {
  const r = "MERCHANDISER";
  it("faqat promo predikatlaridan o'tadi", () => {
    expect(isMerchandiser(r)).toBe(true);
    expect(canSeePromo(r)).toBe(true);
    expect(canEditPromo(r)).toBe(true);
  });
  it("boshqa HECH BIR bo'limga kira olmaydi", () => {
    for (const pred of [
      isSystemAdmin, isAdminTier, canSeeAnalytics, canManageOrders, canReviewAnketa,
      canSeeSuppliers, canEditSuppliers, canSeePme, canEditPme, canManageWarehouse,
      canSeeAnalyze, canSeeChiqim, canSeeSverka,
    ]) {
      expect(pred(r), pred.name).toBe(false);
    }
  });
});

describe("OPERATOR — izolatsiyalangan (faqat chiqim + sverka, read-only)", () => {
  const r = "OPERATOR";
  it("faqat chiqim/sverkani ko'radi", () => {
    expect(isOperator(r)).toBe(true);
    expect(canSeeChiqim(r)).toBe(true);
    expect(canSeeSverka(r)).toBe(true);
  });
  it("boshqa HECH BIR bo'limga kira/tahrir qila olmaydi", () => {
    for (const pred of [
      isSystemAdmin, isAdminTier, canSeeAnalytics, canManageOrders, canReviewAnketa,
      canSeeSuppliers, canEditSuppliers, canSeePme, canEditPme, canManageWarehouse,
      canSeeAnalyze, canSeePromo, canEditPromo,
    ]) {
      expect(pred(r), pred.name).toBe(false);
    }
  });
});

describe("CAT_MANAGER — zakaz o'z doirasiga cheklangan", () => {
  it("yakka CAT_MANAGER faqat o'z zakazini ko'radi", () => {
    expect(ordersScopedToOwn("CAT_MANAGER")).toBe(true);
  });
  it("kengroq rol bilan birga bo'lsa cheklov yo'qoladi (union)", () => {
    expect(ordersScopedToOwn(["CAT_MANAGER", "HEAD_CAT_MANAGER"])).toBe(false);
    expect(ordersScopedToOwn(["CAT_MANAGER", "SYSTEM_ADMIN"])).toBe(false);
  });
  it("suppliers'ni ko'radi lekin tahrirlaydi ham (dizayn bo'yicha)", () => {
    expect(canSeeSuppliers("CAT_MANAGER")).toBe(true);
    expect(canEditSuppliers("CAT_MANAGER")).toBe(true);
  });
});

describe("Ko'p rol union — izolatsiyalangan + normal rol", () => {
  it("OPERATOR + CAT_MANAGER analitikani ochadi (union eng keng ruxsat)", () => {
    expect(canSeeAnalytics(["OPERATOR", "CAT_MANAGER"])).toBe(true);
    expect(canSeeChiqim(["OPERATOR", "CAT_MANAGER"])).toBe(true);
  });
});
