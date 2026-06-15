// Rol predikatlari — markazlashtirilgan ruxsat mantiqi.
//
// SYSTEM_ADMIN — to'liq huquq: barcha tahrir + Tizim bo'limi (oldingi "ADMIN").
// ADMIN        — read-only: Tizimdan boshqa hammasini KO'RADI, o'zgartira olmaydi.
// CAT_MANAGER  — o'z kategoriyalari (Dashboard v2, OOS, chiqim, sotib-olish).
// CEO          — yuqori darajadagi ko'ruvchi.
// SUPPLYCHAIN  — ta'minot zanjiri: analitika/sotuv/spisaniyani KO'RADI,
//                yetkazib beruvchilarni esa TO'LIQ boshqaradi (qo'shish, profil, lead time).
// ADMIN (Bo'lim boshlig'i) va SUPPLYCHAIN — anketalarni ko'rib tasdiqlaydi.
// HEAD_CAT_MANAGER (Kategoriya menejerlari boshi) — BARCHA kategoriyalar bo'yicha
//                menejer ishi (zakaz, OOS/Stockday, barcha zakazlarni ko'rish) +
//                yetkazib beruvchilar read-only.

type R = string | null | undefined;

/** To'liq admin — barcha tahrir amallari va Tizim bo'limi. */
export const isSystemAdmin = (r: R): boolean => r === "SYSTEM_ADMIN";

/** Admin darajasidagi ma'lumotni ko'radi (Baza, Hisobot, Iyerarxiya) — read-only ADMIN ham. */
export const isAdminTier = (r: R): boolean => r === "SYSTEM_ADMIN" || r === "ADMIN";

/** Analitikani ko'ruvchilar (dashboardlar, OOS, Stockday, chiqim, rejalar, sotuv). */
export const canSeeAnalytics = (r: R): boolean =>
  r === "SYSTEM_ADMIN" || r === "ADMIN" || r === "CAT_MANAGER" || r === "CEO" ||
  r === "SUPPLYCHAIN" || r === "HEAD_CAT_MANAGER";

/** Kategoriya menejerlari boshi. */
export const isHeadCatManager = (r: R): boolean => r === "HEAD_CAT_MANAGER";

/** Zakaz yaratish/yuritish: menejer, boshi, supplychain yoki SYSTEM_ADMIN. */
export const canManageOrders = (r: R): boolean =>
  r === "SYSTEM_ADMIN" || r === "CAT_MANAGER" || r === "HEAD_CAT_MANAGER" || r === "SUPPLYCHAIN";

/** Anketalarni ko'rib tasdiqlash — Bo'lim boshlig'i (ADMIN), Supplychain, SYSTEM_ADMIN. */
export const canReviewAnketa = (r: R): boolean =>
  r === "SYSTEM_ADMIN" || r === "ADMIN" || r === "SUPPLYCHAIN";

/** Ta'minot zanjiri roli. */
export const isSupplyChain = (r: R): boolean => r === "SUPPLYCHAIN";

/** Yetkazib beruvchilar bo'limini KO'RA oladiganlar. */
export const canSeeSuppliers = (r: R): boolean => isAdminTier(r) || isSupplyChain(r) || isHeadCatManager(r);

/** Yetkazib beruvchilarni TAHRIRLAY oladiganlar (qo'shish, profil, shartnoma, lead time). */
export const canEditSuppliers = (r: R): boolean => isSystemAdmin(r) || isSupplyChain(r);
