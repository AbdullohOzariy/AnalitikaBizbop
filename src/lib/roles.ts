// Rol predikatlari — markazlashtirilgan ruxsat mantiqi.
//
// SYSTEM_ADMIN — to'liq huquq: barcha tahrir + Tizim bo'limi (oldingi "ADMIN").
// ADMIN        — read-only: Tizimdan boshqa hammasini KO'RADI, o'zgartira olmaydi.
// CAT_MANAGER  — o'z kategoriyalari (Dashboard v2, OOS, chiqim, sotib-olish).
// CEO          — yuqori darajadagi ko'ruvchi.

type R = string | null | undefined;

/** To'liq admin — barcha tahrir amallari va Tizim bo'limi. */
export const isSystemAdmin = (r: R): boolean => r === "SYSTEM_ADMIN";

/** Admin darajasidagi ma'lumotni ko'radi (Baza, Hisobot, Iyerarxiya) — read-only ADMIN ham. */
export const isAdminTier = (r: R): boolean => r === "SYSTEM_ADMIN" || r === "ADMIN";

/** Analitikani ko'ruvchilar (dashboardlar, OOS, Stockday, chiqim, rejalar, sotuv). */
export const canSeeAnalytics = (r: R): boolean =>
  r === "SYSTEM_ADMIN" || r === "ADMIN" || r === "CAT_MANAGER" || r === "CEO";
