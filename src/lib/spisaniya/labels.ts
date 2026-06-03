/**
 * Hisobdan chiqarish / vozvrat yorliqlari — YAGONA MANBA (client-safe, pg importsiz).
 * Server (db.ts re-export qiladi) ham, client komponentlar ham shu yerdan oladi —
 * yorliqlar bir nechta joyda takrorlanib drift bo'lmasligi uchun.
 * (Miniapp alohida Vite build bo'lgani uchun u o'z nusxasini saqlaydi.)
 */

export type ChiqimTur = "spisaniya" | "vozvrat" | "kafe" | "ovqatlanish" | "ichki_sotuv";

export const TUR_LABEL: Record<string, string> = {
  spisaniya: "Spisaniya",
  vozvrat: "Qayta ishlash",
  kafe: "Kafe",
  ovqatlanish: "Ovqatlanish",
  ichki_sotuv: "Ichki sotuv",
};

/** Vozvratni hisobdan chiqarishga o'tkazishda tanlanadigan turlar ('vozvrat'siz). */
export const CHIQIM_OTKAZ_TURLAR: { value: string; label: string }[] = [
  { value: "spisaniya", label: TUR_LABEL.spisaniya },
  { value: "kafe", label: TUR_LABEL.kafe },
  { value: "ovqatlanish", label: TUR_LABEL.ovqatlanish },
  { value: "ichki_sotuv", label: TUR_LABEL.ichki_sotuv },
];

export const VOZVRAT_HOLATLAR = ["xabar_berildi", "yuborildi", "qaytarildi", "qaytarilmadi"] as const;
export type VozvratHolat = (typeof VOZVRAT_HOLATLAR)[number];

export const VOZVRAT_HOLAT_LABEL: Record<string, string> = {
  xabar_berildi: "Xabar berildi",
  yuborildi: "Yuborildi",
  qaytarildi: "Qabul qilindi: qaytarildi",
  qaytarilmadi: "Qabul qilindi: qaytarilmadi",
};

export const VOZVRAT_YONALISH_LABEL: Record<string, string> = {
  asosiy_filial: "Asosiy filialga",
  taminotchi: "Ta'minotchiga",
};
