/**
 * Logistika — ta'minotchi/agent yetkazib berish ko'rsatkichlari (scorecard).
 * Mavjud zakaz ma'lumotidan hisoblanadi (yangi jadval kerak emas):
 *   - o'z vaqtida %  : haqiqiy yetkazish (sentAt→receivedAt) ≤ reja lead
 *   - fill-rate %    : Σ fakt / Σ buyurtma (fakt kiritilgan zakazlar)
 *   - yetkazish kun  : sentAt→receivedAt o'rtacha (haqiqiy lead)
 *   - tsikl kun      : createdAt→receivedAt o'rtacha
 *   - reja lead      : zakaz SKU'larining o'rtacha leadTimeDays
 * Davr — zakaz yaratilgan sana (createdAt) bo'yicha.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export type SupplierLogisticsRow = {
  supplierId: number;
  name: string;
  jami: number; // davrda yaratilgan zakazlar
  qabul: number; // yetib kelgan (RECEIVED)
  qaytdi: number; // qaytarilgan (RETURNED)
  tsiklKun: number | null; // createdAt → receivedAt (o'rtacha kun)
  yetkazishKun: number | null; // sentAt → receivedAt (haqiqiy lead, o'rtacha kun)
  rejaLead: number | null; // SKU leadTimeDays o'rtachasi
  ozVaqtidaPct: number | null; // haqiqiy ≤ reja bo'lgan zakazlar ulushi
  fillRatePct: number | null; // Σ fakt / Σ buyurtma
};

/** Ta'minotchi scorecard — [startStr, endStr] (createdAt) oralig'idagi zakazlar bo'yicha. */
export async function supplierLogistics(startStr: string, endStr: string): Promise<SupplierLogisticsRow[]> {
  // Tugash kunini to'liq qamrash uchun keyingi kun boshigacha (createdAt — timestamp)
  const endNext = new Date(new Date(endStr + "T00:00:00.000Z").getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  return prisma.$queryRaw<SupplierLogisticsRow[]>(Prisma.sql`
    WITH o AS (
      SELECT po.id, po."supplierId", po.status, po."createdAt", po."sentAt", po."receivedAt",
        (SELECT AVG(pr."leadTimeDays")::float8
           FROM "PurchaseOrderItem" it JOIN "Product" pr ON pr.id = it."productId"
           WHERE it."orderId" = po.id AND pr."leadTimeDays" IS NOT NULL) AS planned_lead,
        (SELECT SUM(it."factQty")::float8 FROM "PurchaseOrderItem" it WHERE it."orderId" = po.id AND it."factQty" IS NOT NULL) AS fact_sum,
        (SELECT SUM(it.quantity)::float8 FROM "PurchaseOrderItem" it WHERE it."orderId" = po.id AND it."factQty" IS NOT NULL) AS qty_withfact
      FROM "PurchaseOrder" po
      WHERE po."createdAt" >= ${startStr}::timestamptz AND po."createdAt" < ${endNext}::timestamptz
    )
    SELECT s.id AS "supplierId", s.name,
      COUNT(*)::int AS jami,
      COUNT(*) FILTER (WHERE o.status = 'RECEIVED')::int AS qabul,
      COUNT(*) FILTER (WHERE o.status = 'RETURNED')::int AS qaytdi,
      AVG(EXTRACT(EPOCH FROM (o."receivedAt" - o."createdAt")) / 86400.0)
        FILTER (WHERE o."receivedAt" IS NOT NULL)::float8 AS "tsiklKun",
      AVG(EXTRACT(EPOCH FROM (o."receivedAt" - o."sentAt")) / 86400.0)
        FILTER (WHERE o."receivedAt" IS NOT NULL AND o."sentAt" IS NOT NULL)::float8 AS "yetkazishKun",
      AVG(o.planned_lead) FILTER (WHERE o.planned_lead IS NOT NULL)::float8 AS "rejaLead",
      (COUNT(*) FILTER (
          WHERE o."receivedAt" IS NOT NULL AND o."sentAt" IS NOT NULL AND o.planned_lead IS NOT NULL
            AND EXTRACT(EPOCH FROM (o."receivedAt" - o."sentAt")) / 86400.0 <= o.planned_lead
        )::float8
        / NULLIF(COUNT(*) FILTER (
          WHERE o."receivedAt" IS NOT NULL AND o."sentAt" IS NOT NULL AND o.planned_lead IS NOT NULL
        ), 0) * 100) AS "ozVaqtidaPct",
      (SUM(o.fact_sum) / NULLIF(SUM(o.qty_withfact), 0) * 100) AS "fillRatePct"
    FROM o JOIN "Supplier" s ON s.id = o."supplierId"
    GROUP BY s.id, s.name
    ORDER BY jami DESC, s.name
  `);
}
