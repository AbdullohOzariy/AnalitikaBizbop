/** Iyerarxiya guruh ranglari — view va editor uchun YAGONA manba. */
export const GROUP_COLORS: Record<string, { dot: string; badge: string }> = {
  FRESH: { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  FOOD: { dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  "NON-FOOD": { dot: "bg-blue-500", badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
};

/** Qidiruv uchun normalizatsiya (katta harf). */
export const norm = (s: string) => s.toUpperCase();
