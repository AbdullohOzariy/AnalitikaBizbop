export const ORDER_STATUSES = ["DRAFT", "SENT", "RECEIVED", "RETURNED"] as const;
export type OrderStatusKey = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Qoralama",
  SENT: "Yuborildi",
  RECEIVED: "Qabul qilindi",
  RETURNED: "Qaytarildi",
};

export const ORDER_STATUS_TONE: Record<string, "muted" | "blue" | "green" | "red"> = {
  DRAFT: "muted",
  SENT: "blue",
  RECEIVED: "green",
  RETURNED: "red",
};
