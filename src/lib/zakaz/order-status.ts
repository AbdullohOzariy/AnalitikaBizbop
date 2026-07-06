/**
 * Zakaz workflow — statuslar, tranzitsiyalar va rol-ruxsat matritsasi.
 * Oqim: menejer yaratadi (DRAFT) → tasdiqqa (PENDING) → supplychain tasdiqlaydi
 * (APPROVED) → yetkazib beruvchiga yuboradi (SENT) → zakaz qabul qilindi
 * (ACCEPTED) → yetib keldi (RECEIVED, fakt solishtiriladi). RETURNED — qaytarildi.
 *
 * Rollar: CAT_MANAGER — o'z zakazini yaratadi/tasdiqqa yuboradi, qolganini kuzatadi.
 * SUPPLYCHAIN — tasdiqlash/yuborish/qabul/yetib keldi. HEAD_CAT_MANAGER — hamma
 * zakazda TO'LIQ workflow (ADMIN darajasida) + qatorlarni tahrirlash + fakt.
 * ADMIN (Bo'lim boshlig'i) va SYSTEM_ADMIN — hamma tranzitsiya. Qolganlar — kuzatadi.
 */

export const ORDER_STATUSES = [
  "DRAFT", "PENDING", "APPROVED", "SENT", "ACCEPTED", "RECEIVED", "RETURNED",
] as const;
export type OrderStatusT = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Qoralama",
  PENDING: "Tasdiqda",
  APPROVED: "Tasdiqlandi",
  SENT: "Yuborildi",
  ACCEPTED: "Zakaz qabul qilindi",
  RECEIVED: "Yetib keldi",
  RETURNED: "Qaytarildi",
};

export const ORDER_STATUS_TONE: Record<string, "muted" | "blue" | "green" | "red" | "amber"> = {
  DRAFT: "muted",
  PENDING: "amber",
  APPROVED: "blue",
  SENT: "blue",
  ACCEPTED: "green",
  RECEIVED: "green",
  RETURNED: "red",
};

/** Tranzitsiya tugmasi yorlig'i (maqsad statusga qarab). */
export const TRANSITION_LABEL: Record<string, string> = {
  PENDING: "Tasdiqqa yuborish",
  APPROVED: "Tasdiqlash",
  SENT: "Yetkazib beruvchiga yuborish",
  ACCEPTED: "Zakaz qabul qilindi",
  RECEIVED: "Yetib keldi",
  RETURNED: "Qaytarildi",
  DRAFT: "Qoralamaga qaytarish",
};

/** Mantiqan ruxsat etilgan keyingi statuslar. */
export const NEXT_STATUSES: Record<OrderStatusT, OrderStatusT[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["APPROVED", "DRAFT"],
  APPROVED: ["SENT", "PENDING"],
  SENT: ["ACCEPTED", "RETURNED"],
  ACCEPTED: ["RECEIVED", "RETURNED"],
  RECEIVED: [],
  RETURNED: ["SENT"],
};

import { hasRole } from "@/lib/roles";

// Ko'p-rol: funksiyalar bitta rol yoki rollar massivini qabul qiladi — har bir rol
// bergan huquq OR (union) qilinadi (eng keng ruxsat).
type R = string | null | undefined;
type Roles = R | readonly R[];

/** Rol shu tranzitsiyani bajara oladimi (isOwner — zakaz yaratuvchisimi). */
export function canTransition(r: Roles, from: OrderStatusT, to: OrderStatusT, isOwner: boolean): boolean {
  if (!NEXT_STATUSES[from]?.includes(to)) return false;
  // To'liq huquq: SYSTEM_ADMIN, Bo'lim boshlig'i (ADMIN), Kategoriya menejerlari boshi (HEAD_CAT_MANAGER)
  if (hasRole(r, "SYSTEM_ADMIN", "ADMIN", "HEAD_CAT_MANAGER")) return true;
  // Menejer: o'z zakazini tasdiqqa yuboradi / qaytarib oladi
  if (hasRole(r, "CAT_MANAGER") && isOwner && ((from === "DRAFT" && to === "PENDING") || (from === "PENDING" && to === "DRAFT"))) {
    return true;
  }
  // Supplychain: o'z zakazini tasdiqqa yuboradi (o'zi yaratgan bo'lsa) +
  // tasdiqlash → yuborish → qabul → yetib keldi / qaytarish
  if (hasRole(r, "SUPPLYCHAIN") && (
    (from === "DRAFT" && to === "PENDING" && isOwner) ||
    (from === "PENDING" && (to === "APPROVED" || to === "DRAFT")) ||
    (from === "APPROVED" && (to === "SENT" || to === "PENDING")) ||
    (from === "SENT" && (to === "ACCEPTED" || to === "RETURNED")) ||
    (from === "ACCEPTED" && (to === "RECEIVED" || to === "RETURNED")) ||
    (from === "RETURNED" && to === "SENT")
  )) {
    return true;
  }
  return false;
}

/** Qatorlarni (miqdor/narx) tahrirlash mumkinmi. */
export function canEditItems(r: Roles, status: OrderStatusT, isOwner: boolean): boolean {
  if (hasRole(r, "SYSTEM_ADMIN", "ADMIN", "HEAD_CAT_MANAGER")) return status !== "RECEIVED";
  if (hasRole(r, "SUPPLYCHAIN") && ((status === "DRAFT" && isOwner) || status === "PENDING" || status === "APPROVED")) return true;
  if (hasRole(r, "CAT_MANAGER") && isOwner && status === "DRAFT") return true;
  return false;
}

/** Fakt miqdorlarni kiritish/solishtirish mumkinmi (yetib kelganda). */
export function canEnterFact(r: Roles, status: OrderStatusT): boolean {
  if (status !== "ACCEPTED" && status !== "RECEIVED") return false;
  return hasRole(r, "SYSTEM_ADMIN", "ADMIN", "SUPPLYCHAIN", "HEAD_CAT_MANAGER");
}


// ─── Min stock hisobi (server va client bir xil formula) ─────────────────────
// Min stock = kunlik sotuv × (zakaz oralig'i + lead time) × XYZ buferi
export const XYZ_BUFFER: Record<string, number> = { X: 1.1, Y: 1.25, Z: 1.5 };

export function hisobMinStock(
  dailyAvg: number,
  orderGap: number,
  lead: number | null,
  xyz: string | null
): number | null {
  if (lead == null || lead < 0) return null;
  const buffer = XYZ_BUFFER[xyz ?? ""] ?? 1.25;
  return Math.ceil(dailyAvg * (orderGap + lead) * buffer);
}

// Max stock (to'ldirish darajasi / "order-up-to") = min + yana bitta zakaz sikli (orderGap):
//   max = kunlik × (2·orderGap + lead) × XYZ buferi
// Qoldiq min'dan past bo'lsa — shu max'gacha to'ldiriladi; qoldiq max'dan ko'p — ortiqcha zaxira.
export function hisobMaxStock(
  dailyAvg: number,
  orderGap: number,
  lead: number | null,
  xyz: string | null
): number | null {
  if (lead == null || lead < 0) return null;
  const buffer = XYZ_BUFFER[xyz ?? ""] ?? 1.25;
  return Math.ceil(dailyAvg * (2 * orderGap + lead) * buffer);
}
