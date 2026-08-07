/**
 * To'lov turlari — boshqariladigan ro'yxat (`PaymentKindDef`).
 *
 * Ilgari bu enum edi. To'lov usullari bozorda tez o'zgaradi (Payme, Click,
 * Uzum, bonus, sertifikat...), enum bo'lganda esa har yangi usul migratsiya va
 * deploy talab qilardi — shu oraliqda to'lov "Boshqa" ga tushib, tushum
 * taqsimoti noto'g'ri ko'rinardi.
 */
import { prisma } from "@/lib/prisma";

export type TolovTuri = {
  code: string;
  name: string;
  isCash: boolean;
  tone: string;
  sortOrder: number;
  isSystem: boolean;
};

/** Tanilmagan to'lov shu turga tushadi — hech qachon o'chirilmaydi. */
export const OTHER_CODE = "OTHER";

/**
 * Ruxsat etilgan ranglar.
 *
 * Erkin HEX ATAYLAB emas: u qorong'i rejimda o'qilmay qolishi va dizayn
 * tizimidan chiqib ketishi mumkin. Tailwind sinflari shu yerda TO'LIQ yozilgan —
 * ular kodda literal bo'lishi shart, aks holda JIT ularni yig'maydi.
 */
export const TONES: Record<
  string,
  { nom: string; pill: string; bar: string; on: string }
> = {
  green: {
    nom: "Yashil",
    pill: "bg-primary/10 text-primary",
    bar: "bg-primary",
    on: "data-[on=true]:bg-primary data-[on=true]:text-primary-foreground",
  },
  blue: {
    nom: "Ko'k",
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500",
    on: "data-[on=true]:bg-blue-600 data-[on=true]:text-white",
  },
  violet: {
    nom: "Binafsha",
    pill: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
    on: "data-[on=true]:bg-violet-600 data-[on=true]:text-white",
  },
  amber: {
    nom: "Sariq",
    pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    on: "data-[on=true]:bg-amber-500 data-[on=true]:text-white",
  },
  rose: {
    nom: "Pushti",
    pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    on: "data-[on=true]:bg-rose-600 data-[on=true]:text-white",
  },
  cyan: {
    nom: "Moviy",
    pill: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    bar: "bg-cyan-500",
    on: "data-[on=true]:bg-cyan-600 data-[on=true]:text-white",
  },
  slate: {
    nom: "Kulrang",
    pill: "bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/50",
    on: "data-[on=true]:bg-muted-foreground data-[on=true]:text-background",
  },
};

export const TONE_CODES = Object.keys(TONES);
export const toneOf = (t: string) => TONES[t] ?? TONES.slate;

/** Barcha turlar, ko'rsatish tartibida. */
export async function tolovTurlari(): Promise<TolovTuri[]> {
  return prisma.paymentKindDef.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      code: true,
      name: true,
      isCash: true,
      tone: true,
      sortOrder: true,
      isSystem: true,
    },
  });
}

/**
 * Kod → tur. Ro'yxatda yo'q kod uchun "o'chirilgan" ko'rinishdagi vaqtinchalik
 * yozuv qaytadi: eski chekdagi tur o'chirilgan bo'lsa ham qator yo'qolmasin.
 */
export function turXaritasi(list: TolovTuri[]): (code: string) => TolovTuri {
  const m = new Map(list.map((t) => [t.code, t]));
  return (code) =>
    m.get(code) ?? {
      code,
      name: code,
      isCash: false,
      tone: "slate",
      sortOrder: 999,
      isSystem: false,
    };
}

/** Kod normallashtirish: katta harf, faqat harf/raqam/pastki chiziq. */
export function kodNormalla(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
}
