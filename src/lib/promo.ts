// Promo (Aksiyalar) bo'limining umumiy konstantalari va yordamchilari.
// PROMO_CACHE_TAG — barcha promo CUD action'laridan keyin revalidateTag(..., "max")
// bilan tozalanadi; Faza 3 hisobot (promo/hisobot) ham shu tag bilan keshlanadi.
// ANALYTICS_CACHE_TAG = "analytics" naqshiga mos (src/lib/analytics.ts).
export const PROMO_CACHE_TAG = "promo";

// Doimiy aksiya turlari (FLASH bundan tashqari — alohida Faza/bo'lim).
// Bu fayl client komponentlarda ham import qilinadi — shuning uchun Prisma client'ni
// (server-only, node:module) RUNTIME import QILMAYMIZ. String literal + `satisfies`
// bilan Prisma PromoType bilan moslik compile-time tekshiriladi (type-only import).
import type { PromoType } from "@/generated/prisma/client";

export const DOIMIY_PROMO_TYPES = [
  "KUN_TAKLIFI",
  "HAFTA_CHEGIRMA",
  "BIZBOP_NARX",
  "AAARZON",
] as const satisfies readonly PromoType[];

export type DoimiyPromoType = (typeof DOIMIY_PROMO_TYPES)[number];

// Doimiy aksiya turlari uchun meta — tab nomi, mijoz signali, odatiy davomiyligi
// (kun; null = doimiy/oylik). Rasmdagi jadvalga mos.
export const PROMO_TYPE_META: Record<
  DoimiyPromoType,
  { label: string; signal: string; durationDays: number | null }
> = {
  KUN_TAKLIFI: { label: "Kun taklifi", signal: "FAQAT BUGUN!", durationDays: 1 },
  HAFTA_CHEGIRMA: { label: "Hafta chegirmasi", signal: "HAFTALIK FOYDA", durationDays: 7 },
  BIZBOP_NARX: { label: "Bizbop narx", signal: "HAR DOIM ARZON", durationDays: null },
  AAARZON: { label: "A-a-arzon narx!", signal: "ENG KUCHLI CHEGIRMA!", durationDays: 14 },
};
