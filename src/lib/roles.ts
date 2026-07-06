// Rol predikatlari — markazlashtirilgan ruxsat mantiqi.
//
// SYSTEM_ADMIN — to'liq huquq: barcha tahrir + Tizim bo'limi (oldingi "ADMIN").
// ADMIN        — "Bo'lim boshlig'i": asosan KO'RADI, lekin ATAYLAB berilgan istisnolar bor —
//                harajat kiritish/o'chirish (sotuv/finans), zakaz workflow'ining to'liq
//                tranzitsiyalari (order-status.ts) va anketa tasdiqlash. Qolgan barcha
//                canEdit*/canManage* predikatlarida ADMIN YO'Q (tahrir qila olmaydi).
// CAT_MANAGER  — o'z kategoriyalari (Dashboard v2, OOS, chiqim, sotib-olish).
// CEO          — yuqori darajadagi ko'ruvchi.
// SUPPLYCHAIN  — ta'minot zanjiri: analitika/sotuv/spisaniyani KO'RADI,
//                yetkazib beruvchilarni esa TO'LIQ boshqaradi (qo'shish, profil, lead time).
// ADMIN (Bo'lim boshlig'i) va SUPPLYCHAIN — anketalarni ko'rib tasdiqlaydi.
// HEAD_CAT_MANAGER (Kategoriya menejerlari boshi) — BARCHA kategoriyalar bo'yicha
//                kengaytirilgan huquq: hamma zakazni ko'rish + TO'LIQ zakaz workflow
//                (tasdiqlash/yuborish/qabul/fakt, ADMIN darajasida) + yetkazib beruvchilarni TAHRIRLASH.

// Ko'p rol: predikatlar bitta rol (string) YOKI rollar massivini (union) qabul qiladi.
// Massiv berilsa — rollardan BIRORTASI mos kelsa true (eng keng ruxsat). Eski chaqiruvlar
// (bitta `session.user.role` uzatadiganlar) ham ishlayveradi; ko'p-rol ruxsati uchun
// `session.user.roles` (massiv) uzatiladi.
type R = string | null | undefined;
type Roles = R | readonly R[];

/** Berilgan rol(lar) ichida ruxsat etilganlardan birortasi bormi. */
export function hasRole(r: Roles, ...allowed: string[]): boolean {
  const set = Array.isArray(r) ? r : [r];
  const allow = new Set(allowed);
  for (const x of set) if (x && allow.has(x)) return true;
  return false;
}

/** To'liq admin — barcha tahrir amallari va Tizim bo'limi. */
export const isSystemAdmin = (r: Roles): boolean => hasRole(r, "SYSTEM_ADMIN");

/** Admin darajasidagi ma'lumotni ko'radi (Baza, Hisobot, Iyerarxiya) — read-only ADMIN ham. */
export const isAdminTier = (r: Roles): boolean => hasRole(r, "SYSTEM_ADMIN", "ADMIN");

/** Analitikani ko'ruvchilar (dashboardlar, OOS, Stockday, chiqim, rejalar, sotuv). */
export const canSeeAnalytics = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER");

/** Zakaz yaratish/yuritish: menejer, boshi, supplychain yoki SYSTEM_ADMIN. */
export const canManageOrders = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "CAT_MANAGER", "HEAD_CAT_MANAGER", "SUPPLYCHAIN");

/** Zakazlar faqat O'ZINIKIga cheklanganmi — CAT_MANAGER, lekin kengroq ko'ruvchi rol YO'Q.
 *  (CAT_MANAGER + HEAD/SUPPLYCHAIN/admin → hammasini ko'radi, cheklov yo'q.) */
export const ordersScopedToOwn = (r: Roles): boolean =>
  hasRole(r, "CAT_MANAGER") &&
  !hasRole(r, "SYSTEM_ADMIN", "ADMIN", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER");

/** Anketalarni ko'rib tasdiqlash — Bo'lim boshlig'i (ADMIN), Supplychain, SYSTEM_ADMIN. */
export const canReviewAnketa = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "SUPPLYCHAIN");

/** Ta'minot zanjiri roli. */
export const isSupplyChain = (r: Roles): boolean => hasRole(r, "SUPPLYCHAIN");

/** Yetkazib beruvchilar bo'limini KO'RA oladiganlar (CAT_MANAGER — read-only, tahrir yo'q). */
export const canSeeSuppliers = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "CAT_MANAGER");

/** Yetkazib beruvchilarni TAHRIRLAY oladiganlar (profil, shartnoma, lead time, agent, SKU biriktirish, qo'shish/o'chirish).
 *  CAT_MANAGER va HEAD_CAT_MANAGER ham tahrirlaydi. Eslatma: ombor qoldig'i tahriri bundan MUSTAQIL — u `canManageWarehouse`. */
export const canEditSuppliers = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "SUPPLYCHAIN", "CAT_MANAGER", "HEAD_CAT_MANAGER");

/** PME analyze (P/M/E segment) bo'limini KO'RA oladiganlar — read-only ADMIN ham. */
export const canSeePme = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "SUPPLYCHAIN", "CAT_MANAGER", "HEAD_CAT_MANAGER");

/** PME segmentni biriktira (tahrirlay) oladiganlar — read-only ADMIN bundan mustasno. */
export const canEditPme = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "SUPPLYCHAIN", "CAT_MANAGER", "HEAD_CAT_MANAGER");

/** Ombor + taqsimot (logistika operatsiyalari) — qoldiq import, ombor→filial taqsimot. */
export const canManageWarehouse = (r: Roles): boolean => hasRole(r, "SYSTEM_ADMIN", "SUPPLYCHAIN");

/** Analyze (narx sifati: filiallar narx farqi, summa÷soni ≠ narx) bo'limini KO'RA oladiganlar.
 *  Narx anomaliyalarini ko'rsatuvchi tahliliy bo'lim — analitika ko'ruvchilar uchun (read-only ADMIN ham). */
export const canSeeAnalyze = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "SUPPLYCHAIN", "CAT_MANAGER", "HEAD_CAT_MANAGER");

// ─── Promo (Aksiyalar) ────────────────────────────────────────────────────
// MERCHANDISER — IZOLATSIYALANGAN rol: FAQAT Promo bo'limini ko'radi/tahrirlaydi.
// Yuqoridagi hech bir canSee*/canEdit*/canManage*/isAdminTier predikatida
// "MERCHANDISER" yo'q — shuning uchun u boshqa hech bir bo'limga kira olmaydi.

/** Merchandiser roli (yordamchi — redirect/izolatsiya tekshiruvlari uchun). */
export const isMerchandiser = (r: Roles): boolean => hasRole(r, "MERCHANDISER");

/** Promo (Aksiyalar) bo'limini KO'RA oladiganlar — read-only ADMIN ham ko'radi. */
export const canSeePromo = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MERCHANDISER");

/** Promo (Aksiyalar)ni TAHRIRLAY oladiganlar — read-only ADMIN bundan MUSTASNO. */
export const canEditPromo = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MERCHANDISER");

// ─── Operator (Hisobdan chiqarish + Sverka kuzatuvchisi) ──────────────────────
// OPERATOR — IZOLATSIYALANGAN rol: FAQAT Hisobdan chiqarish (chiqim) va Sverkani
// KUZATADI (read-only). Yuqoridagi hech bir canSee*/canEdit*/canManage*/isAdminTier
// predikatida "OPERATOR" yo'q — boshqa bo'limga kira olmaydi, hech narsa tahrirlay
// olmaydi (o'zgartirish actionlari uni o'tkazmaydi).

/** Operator roli (redirect/izolatsiya tekshiruvlari uchun). */
export const isOperator = (r: Roles): boolean => hasRole(r, "OPERATOR");

/** Hisobdan chiqarish (chiqim) bo'limini KO'RA oladiganlar — analitika ko'ruvchilar + operator. */
export const canSeeChiqim = (r: Roles): boolean => canSeeAnalytics(r) || isOperator(r);

/** Sverka bo'limini KO'RA oladiganlar — SYSTEM_ADMIN, ADMIN, SUPPLYCHAIN, CEO + operator. */
export const canSeeSverka = (r: Roles): boolean =>
  hasRole(r, "SYSTEM_ADMIN", "ADMIN", "SUPPLYCHAIN", "CEO", "OPERATOR");
