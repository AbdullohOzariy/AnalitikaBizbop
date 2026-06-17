/**
 * Yetkazib berish kalendari — yuborilgan, lekin hali yetib kelmagan zakazlar
 * (SENT / ACCEPTED). Kutilgan sana = yuborilgan sana + reja lead (zakaz SKU'larining
 * leadTimeDays o'rtachasi, yuqoriga yaxlitlanadi). Kechikish = bugun − kutilgan sana.
 * Yangi jadval kerak emas — mavjud PurchaseOrder timestamp'laridan.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const TASH = 5 * 3_600_000; // Toshkent UTC+5 (DST yo'q)

function tashDateStr(d: Date | number): string {
  return new Date((typeof d === "number" ? d : d.getTime()) + TASH).toISOString().slice(0, 10);
}
function dateFromStr(s: string): Date { return new Date(s + "T00:00:00.000Z"); }
function addDays(s: string, n: number): string {
  return new Date(dateFromStr(s).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
/** a − b kunlarda (musbat = a kechroq). */
function daysBetween(a: string, b: string): number {
  return Math.round((dateFromStr(a).getTime() - dateFromStr(b).getTime()) / 86_400_000);
}

export type ExpectedDelivery = {
  orderId: number;
  supplier: string;
  agent: string | null;
  status: string;
  sentDate: string; // yuborilgan sana (YYYY-MM-DD, Toshkent)
  plannedLead: number | null; // reja lead (kun), o'rtacha
  expectedDate: string | null; // kutilgan yetib kelish sanasi
  daysLate: number; // > 0 — kechikdi; 0 — o'z vaqtida/erta/ETA noma'lum
  daysUntil: number | null; // kutilgangacha qolgan kun (manfiy = o'tib ketgan)
  itemCount: number;
  totalQty: number;
};

type RawRow = {
  orderId: number; supplier: string; agent: string | null; status: string;
  sentAt: Date; plannedLead: number | null; itemCount: number; totalQty: number;
};

/** Kutilayotgan yetkazishlar — yuborilgan (SENT/ACCEPTED), hali kelmagan zakazlar. */
export async function expectedDeliveries(): Promise<ExpectedDelivery[]> {
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT po.id AS "orderId", s.name AS supplier, ag.name AS agent, po.status::text AS status,
      po."sentAt" AS "sentAt",
      (SELECT AVG(pr."leadTimeDays")::float8 FROM "PurchaseOrderItem" it
         JOIN "Product" pr ON pr.id = it."productId"
         WHERE it."orderId" = po.id AND pr."leadTimeDays" IS NOT NULL) AS "plannedLead",
      (SELECT COUNT(*)::int FROM "PurchaseOrderItem" it WHERE it."orderId" = po.id) AS "itemCount",
      (SELECT COALESCE(SUM(it.quantity), 0)::float8 FROM "PurchaseOrderItem" it WHERE it."orderId" = po.id) AS "totalQty"
    FROM "PurchaseOrder" po
    JOIN "Supplier" s ON s.id = po."supplierId"
    LEFT JOIN "Agent" ag ON ag.id = po."agentId"
    WHERE po.status IN ('SENT', 'ACCEPTED') AND po."sentAt" IS NOT NULL AND po."receivedAt" IS NULL
    ORDER BY po."sentAt" ASC
  `);

  const today = tashDateStr(Date.now());

  return rows
    .map((r) => {
      const sentDate = tashDateStr(r.sentAt);
      const lead = r.plannedLead != null ? Math.ceil(r.plannedLead) : null;
      const expectedDate = lead != null ? addDays(sentDate, lead) : null;
      const daysUntil = expectedDate ? daysBetween(expectedDate, today) : null;
      const daysLate = expectedDate ? Math.max(0, daysBetween(today, expectedDate)) : 0;
      return {
        orderId: r.orderId, supplier: r.supplier, agent: r.agent, status: r.status,
        sentDate, plannedLead: r.plannedLead, expectedDate, daysLate, daysUntil,
        itemCount: r.itemCount, totalQty: r.totalQty,
      };
    })
    .sort((a, b) => {
      // Kechikkanlar avval (kechikish kamayish tartibida), so'ng kutilgan sana bo'yicha, ETA yo'q oxirida
      if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
      if (a.expectedDate && b.expectedDate) return a.expectedDate < b.expectedDate ? -1 : a.expectedDate > b.expectedDate ? 1 : 0;
      if (a.expectedDate) return -1;
      if (b.expectedDate) return 1;
      return a.sentDate < b.sentDate ? -1 : 1;
    });
}

/** Faqat kechikkan yetkazishlar (signal uchun). */
export async function lateDeliveries(): Promise<ExpectedDelivery[]> {
  return (await expectedDeliveries()).filter((d) => d.daysLate > 0);
}
