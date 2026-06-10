/**
 * SKU'ning ABC×XYZ matritsa holatiga ko'ra ranglar — BUTUN tizimda bir xil
 * (ABC/XYZ sahifasi, iyerarxiya, OOS/Stockday, baza, buyurtma yaratish).
 *
 * Client-safe: prisma/server importlari YO'Q. Tailwind klasslari to'liq satr
 * ko'rinishida (JIT faqat statik satrlarni ko'radi).
 *
 * Rang mantig'i (matritsa bilan bir xil):
 *   yashil  — AX (eng to'q) · AY · BX        — barqaror daromad
 *   amber   — AZ (to'qroq) · BY · CX          — o'rtacha/o'zgaruvchan
 *   orange  — BZ · CY                         — notekis
 *   qizil   — CZ                              — chiqarish nomzodi
 */

const key = (abc?: string | null, xyz?: string | null): string | null =>
  abc && xyz ? `${abc}${xyz}` : null;

/** Jadval qatori foni — yumshoq, matn o'qilishiga xalal bermaydi. */
const ROW_BG: Record<string, string> = {
  AX: "bg-emerald-500/25 hover:bg-emerald-500/30 dark:bg-emerald-500/20",
  AY: "bg-emerald-500/15 hover:bg-emerald-500/20 dark:bg-emerald-500/10",
  BX: "bg-emerald-500/10 hover:bg-emerald-500/15 dark:bg-emerald-500/[0.07]",
  AZ: "bg-amber-500/20 hover:bg-amber-500/25 dark:bg-amber-500/15",
  BY: "bg-amber-500/15 hover:bg-amber-500/20 dark:bg-amber-500/10",
  CX: "bg-amber-500/10 hover:bg-amber-500/15 dark:bg-amber-500/[0.07]",
  BZ: "bg-orange-500/20 hover:bg-orange-500/25 dark:bg-orange-500/15",
  CY: "bg-orange-500/20 hover:bg-orange-500/25 dark:bg-orange-500/15",
  CZ: "bg-red-500/20 hover:bg-red-500/25 dark:bg-red-500/15",
};

/** Belgi (badge) — "AX" ko'rinishida, kuchliroq rang. */
const BADGE_CLS: Record<string, string> = {
  AX: "border-emerald-600/60 bg-emerald-500/25 text-emerald-800 dark:text-emerald-300",
  AY: "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  BX: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  AZ: "border-amber-500/60 bg-amber-500/20 text-amber-800 dark:text-amber-300",
  BY: "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  CX: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  BZ: "border-orange-500/60 bg-orange-500/20 text-orange-800 dark:text-orange-300",
  CY: "border-orange-500/60 bg-orange-500/20 text-orange-800 dark:text-orange-300",
  CZ: "border-red-500/60 bg-red-500/20 text-red-800 dark:text-red-300",
};

/** Matritsa katagi (ABC/XYZ sahifasi) — eng to'q variant. */
export const MATRIX_CELL_CLS: Record<string, string> = {
  AX: "border-emerald-600/70 bg-emerald-500/30",
  AY: "border-emerald-500/50 bg-emerald-500/20",
  BX: "border-emerald-500/45 bg-emerald-500/15",
  AZ: "border-amber-500/65 bg-amber-500/25",
  BY: "border-amber-500/50 bg-amber-500/15",
  CX: "border-amber-500/40 bg-amber-500/10",
  BZ: "border-orange-500/65 bg-orange-500/25",
  CY: "border-orange-500/60 bg-orange-500/20",
  CZ: "border-red-500/65 bg-red-500/25",
};

// Sinfsiz SKU (so'nggi 3 oyda savdo yo'q — ABC/XYZ hisoblab bo'lmaydi):
// oq qoldirmaymiz, aniq kulrang indikator beramiz — bu o'zi signal (chiqarish nomzodi).
const NO_CLASS_BG = "bg-zinc-400/15 hover:bg-zinc-400/20 dark:bg-zinc-500/10";
const NO_CLASS_BADGE = "border-border bg-muted text-muted-foreground";

/** Qator foni klassi; sinf yo'q (savdosiz SKU) — kulrang neytral indikator. */
export function skuRowBg(abc?: string | null, xyz?: string | null): string {
  const k = key(abc, xyz);
  return k ? ROW_BG[k] ?? NO_CLASS_BG : NO_CLASS_BG;
}

/** "AX" badge klassi (umumiy pill bilan ishlatish uchun). */
export function skuBadgeCls(abc?: string | null, xyz?: string | null): string {
  const k = key(abc, xyz);
  return k ? BADGE_CLS[k] ?? NO_CLASS_BADGE : NO_CLASS_BADGE;
}

/** Badge matni: "AX" yoki sinfsizlar uchun "—". */
export function skuBadgeLabel(abc?: string | null, xyz?: string | null): string {
  return key(abc, xyz) ?? "—";
}

/** Tooltip matni — badge ustiga borganda. */
export function skuBadgeTitle(abc?: string | null, xyz?: string | null): string {
  const k = key(abc, xyz);
  return k
    ? `ABC×XYZ matritsa holati: ${k}`
    : "So'nggi 3 oyda savdo yo'q — sinf aniqlanmagan (chiqarish nomzodi)";
}
