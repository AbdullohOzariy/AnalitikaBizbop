// Rol predikatlari — markazlashtirilgan ruxsat mantiqi.
//
// SYSTEM_ADMIN — to'liq huquq: barcha tahrir + Tizim bo'limi (oldingi "ADMIN").
// ADMIN        — read-only: Tizimdan boshqa hammasini KO'RADI, o'zgartira olmaydi.
// CAT_MANAGER  — o'z kategoriyalari (Dashboard v2, OOS, chiqim, sotib-olish).
// CEO          — yuqori darajadagi ko'ruvchi.
// SUPPLYCHAIN  — ta'minot zanjiri: analitika/sotuv/spisaniyani KO'RADI,
//                yetkazib beruvchilarni esa TO'LIQ boshqaradi (qo'shish, profil, lead time).

type R = string | null | undefined;

/** To'liq admin — barcha tahrir amallari va Tizim bo'limi. */
export const isSystemAdmin = (r: R): boolean => r === "SYSTEM_ADMIN";

/** Admin darajasidagi ma'lumotni ko'radi (Baza, Hisobot, Iyerarxiya) — read-only ADMIN ham. */
export const isAdminTier = (r: R): boolean => r === "SYSTEM_ADMIN" || r === "ADMIN";

/** Analitikani ko'ruvchilar (dashboardlar, OOS, Stockday, chiqim, rejalar, sotuv). */
export const canSeeAnalytics = (r: R): boolean =>
  r === "SYSTEM_ADMIN" || r === "ADMIN" || r === "CAT_MANAGER" || r === "CEO" || r === "SUPPLYCHAIN";

/** Ta'minot zanjiri roli. */
export const isSupplyChain = (r: R): boolean => r === "SUPPLYCHAIN";

/** Yetkazib beruvchilar bo'limini KO'RA oladiganlar. */
export const canSeeSuppliers = (r: R): boolean => isAdminTier(r) || isSupplyChain(r);

/** Yetkazib beruvchilarni TAHRIRLAY oladiganlar (qo'shish, profil, shartnoma, lead time). */
export const canEditSuppliers = (r: R): boolean => isSystemAdmin(r) || isSupplyChain(r);
