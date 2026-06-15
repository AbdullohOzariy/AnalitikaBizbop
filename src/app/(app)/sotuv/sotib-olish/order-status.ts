/**
 * Zakaz workflow — statuslar, tranzitsiyalar va rol-ruxsat matritsasi.
 * Oqim: menejer yaratadi (DRAFT) → tasdiqqa (PENDING) → supplychain tasdiqlaydi
 * (APPROVED) → yetkazib beruvchiga yuboradi (SENT) → zakaz qabul qilindi
 * (ACCEPTED) → yetib keldi (RECEIVED, fakt solishtiriladi). RETURNED — qaytarildi.
 *
 * Rollar: CAT_MANAGER — o'z zakazini yaratadi/tasdiqqa yuboradi, qolganini kuzatadi.
 * SUPPLYCHAIN — tasdiqlash/yuborish/qabul/yetib keldi. HEAD_CAT_MANAGER — menejer
 * ishi (hamma zakazda) + yetib keldi/fakt. ADMIN (Bo'lim boshlig'i) va SYSTEM_ADMIN —
 * hamma tranzitsiya. Qolganlar — faqat kuzatadi.
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

type R = string | null | undefined;

/** Rol shu tranzitsiyani bajara oladimi (isOwner — zakaz yaratuvchisimi). */
export function canTransition(role: R, from: OrderStatusT, to: OrderStatusT, isOwner: boolean): boolean {
  if (!NEXT_STATUSES[from]?.includes(to)) return false;
  // To'liq huquq: SYSTEM_ADMIN va Bo'lim boshlig'i (ADMIN)
  if (role === "SYSTEM_ADMIN" || role === "ADMIN") return true;
  // Menejer: o'z zakazini tasdiqqa yuboradi / qaytarib oladi
  if (role === "CAT_MANAGER") {
    return isOwner && ((from === "DRAFT" && to === "PENDING") || (from === "PENDING" && to === "DRAFT"));
  }
  // Menejerlar boshi: hamma zakazda menejer ishi + yetib keldi
  if (role === "HEAD_CAT_MANAGER") {
    return (
      (from === "DRAFT" && to === "PENDING") ||
      (from === "PENDING" && to === "DRAFT") ||
      (from === "ACCEPTED" && to === "RECEIVED")
    );
  }
  // Supplychain: o'z zakazini tasdiqqa yuboradi (o'zi yaratgan bo'lsa) +
  // tasdiqlash → yuborish → qabul → yetib keldi / qaytarish
  if (role === "SUPPLYCHAIN") {
    return (
      (from === "DRAFT" && to === "PENDING" && isOwner) ||
      (from === "PENDING" && (to === "APPROVED" || to === "DRAFT")) ||
      (from === "APPROVED" && (to === "SENT" || to === "PENDING")) ||
      (from === "SENT" && (to === "ACCEPTED" || to === "RETURNED")) ||
      (from === "ACCEPTED" && (to === "RECEIVED" || to === "RETURNED")) ||
      (from === "RETURNED" && to === "SENT")
    );
  }
  return false;
}

/** Qatorlarni (miqdor/narx) tahrirlash mumkinmi. */
export function canEditItems(role: R, status: OrderStatusT, isOwner: boolean): boolean {
  if (role === "SYSTEM_ADMIN" || role === "ADMIN") return status !== "RECEIVED";
  if (role === "CAT_MANAGER") return isOwner && status === "DRAFT";
  if (role === "HEAD_CAT_MANAGER") return status === "DRAFT";
  if (role === "SUPPLYCHAIN") return (status === "DRAFT" && isOwner) || status === "PENDING" || status === "APPROVED";
  return false;
}

/** Fakt miqdorlarni kiritish/solishtirish mumkinmi (yetib kelganda). */
export function canEnterFact(role: R, status: OrderStatusT): boolean {
  if (status !== "ACCEPTED" && status !== "RECEIVED") return false;
  return role === "SYSTEM_ADMIN" || role === "ADMIN" || role === "SUPPLYCHAIN" || role === "HEAD_CAT_MANAGER";
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
