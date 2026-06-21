"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, type PromoType, type PromoStatus } from "@/generated/prisma/client";
import { requirePromoView } from "@/lib/auth-helpers";

// Promo hisobot — aksiya samaradorligini ProductSales (period kesimida sotuv)
// bilan o'lchaydi. 3 davr: aksiya davri, undan oldingi teng davr (baseline),
// undan keyingi teng davr (narx qaytdimi tekshiruvi). Period proratsiya
// (frac) — profit.ts naqshi bilan, davr chetidagi qisman yozuvlar uchun.

const DAY = 86_400_000;
const toUTC = (s: string) => new Date(s + "T00:00:00.000Z");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(toUTC(s).getTime() + n * DAY));
const diffDays = (a: string, b: string) => Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY);

type Err = { ok: false; error: string };

export type ReportCampaignOpt = {
  id: number;
  title: string;
  type: PromoType;
  status: PromoStatus;
  startDate: string;
  endDate: string | null;
};

export type ReportItem = {
  productId: number;
  name: string;
  code: number;
  regularPrice: number;
  promoPrice: number;
  // Aksiya davri vs oldingi (baseline) davr
  promoQty: number;
  promoAmount: number;
  baseQty: number;
  baseAmount: number;
  growthQtyPct: number | null; // null = baseline 0 (taqqoslab bo'lmaydi)
  growthAmountPct: number | null;
  // Narx qaytdimi (aksiya tugagandan keyingi davr o'rtacha narxi)
  afterAvgPrice: number | null;
  priceStatus: "returned" | "stuck" | "unknown"; // asliga qaytdi / aksiyada qoldi / ma'lumot yo'q
};

export type PromoReport = {
  campaign: ReportCampaignOpt & { branchName: string | null };
  periodStart: string;
  periodEnd: string; // effektiv (endDate yoki bugun)
  baseStart: string;
  baseEnd: string;
  hasAfter: boolean; // aksiya tugaganmi (after davri mavjudmi)
  items: ReportItem[];
  totals: {
    promoAmount: number; baseAmount: number; growthAmountPct: number | null;
    promoQty: number; baseQty: number; growthQtyPct: number | null;
  };
};

export async function listReportCampaignsAction(): Promise<{ ok: true; rows: ReportCampaignOpt[] } | Err> {
  try {
    await requirePromoView();
    const rows = await prisma.promoCampaign.findMany({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      select: { id: true, title: true, type: true, status: true, startDate: true, endDate: true },
    });
    return {
      ok: true,
      rows: rows.map((c): ReportCampaignOpt => ({
        id: c.id, title: c.title, type: c.type, status: c.status,
        startDate: ymd(c.startDate), endDate: c.endDate ? ymd(c.endDate) : null,
      })),
    };
  } catch (err) { return fail(err); }
}

const pct = (cur: number, base: number): number | null => (base > 0 ? ((cur - base) / base) * 100 : null);

export async function promoReportAction(input: { campaignId: number }): Promise<{ ok: true; report: PromoReport } | Err> {
  try {
    await requirePromoView();
    const campaignId = z.coerce.number().int().positive().parse(input.campaignId);

    const c = await prisma.promoCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true, title: true, type: true, status: true, startDate: true, endDate: true, branchId: true,
        branch: { select: { name: true } },
        items: { select: { productId: true, regularPrice: true, promoPrice: true, product: { select: { name: true, code: true } } } },
      },
    });
    if (!c) return { ok: false, error: "Aksiya topilmadi." };

    const start = ymd(c.startDate);
    // Effektiv tugash: endDate yoki bugun (doimiy aksiya uchun). Bugun — Toshkent (UTC+5).
    const todayStr = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    const end = c.endDate ? ymd(c.endDate) : todayStr;

    const len = Math.max(1, diffDays(start, end) + 1); // davr uzunligi (kun)
    const baseStart = addDays(start, -len);
    const baseEnd = addDays(start, -1);
    const afterStart = addDays(end, 1);
    const afterEnd = addDays(end, len);
    const hasAfter = c.endDate != null && end < todayStr; // aksiya tugagan

    const pids = c.items.map((i) => i.productId);
    const branchSql = c.branchId ? Prisma.sql`AND ps."branchId" = ${c.branchId}` : Prisma.empty;

    // Har SKU bo'yicha 3 davr sotuvi (proratsiya frac bilan). pids bo'sh bo'lsa so'rov yo'q.
    type Row = { pid: number; promo_qty: number; promo_amt: number; base_qty: number; base_amt: number; after_qty: number; after_amt: number };
    const rows: Row[] = pids.length === 0 ? [] : await prisma.$queryRaw<Row[]>`
      SELECT ps."productId" AS pid,
        SUM(ps."soldQty" * fr.f_promo)::float8 AS promo_qty,
        SUM(ps.amount    * fr.f_promo)::float8 AS promo_amt,
        SUM(ps."soldQty" * fr.f_base)::float8  AS base_qty,
        SUM(ps.amount    * fr.f_base)::float8  AS base_amt,
        SUM(ps."soldQty" * fr.f_after)::float8 AS after_qty,
        SUM(ps.amount    * fr.f_after)::float8 AS after_amt
      FROM "ProductSales" ps
      JOIN LATERAL (
        SELECT
          GREATEST(0, (LEAST(ps."periodEnd", ${end}::date)       - GREATEST(ps."periodStart", ${start}::date)      + 1))::float8 / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0) AS f_promo,
          GREATEST(0, (LEAST(ps."periodEnd", ${baseEnd}::date)   - GREATEST(ps."periodStart", ${baseStart}::date)  + 1))::float8 / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0) AS f_base,
          GREATEST(0, (LEAST(ps."periodEnd", ${afterEnd}::date)  - GREATEST(ps."periodStart", ${afterStart}::date) + 1))::float8 / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0) AS f_after
      ) fr ON true
      WHERE ps."productId" = ANY(${pids})
        AND ps."periodEnd" >= ${baseStart}::date
        AND ps."periodStart" <= ${afterEnd}::date
        ${branchSql}
      GROUP BY ps."productId"
    `;
    const byPid = new Map(rows.map((r) => [Number(r.pid), r]));

    const items: ReportItem[] = c.items.map((it) => {
      const r = byPid.get(it.productId);
      const reg = Number(it.regularPrice);
      const promo = Number(it.promoPrice);
      const promoQty = r ? r.promo_qty : 0;
      const promoAmount = r ? r.promo_amt : 0;
      const baseQty = r ? r.base_qty : 0;
      const baseAmount = r ? r.base_amt : 0;
      const afterQty = r ? r.after_qty : 0;
      const afterAmount = r ? r.after_amt : 0;
      const afterAvg = hasAfter && afterQty > 0 ? afterAmount / afterQty : null;
      // Narx asliga qaytdimi? after o'rtacha narx regularga yaqin (±5%) → qaytdi; promoga yaqin → qoldi
      let priceStatus: ReportItem["priceStatus"] = "unknown";
      if (afterAvg != null && reg > 0) {
        const dReg = Math.abs(afterAvg - reg) / reg;
        const dPromo = promo > 0 ? Math.abs(afterAvg - promo) / promo : Infinity;
        priceStatus = dReg <= 0.05 ? "returned" : dPromo <= 0.05 ? "stuck" : afterAvg >= reg * 0.95 ? "returned" : "stuck";
      }
      return {
        productId: it.productId, name: it.product.name, code: it.product.code,
        regularPrice: reg, promoPrice: promo,
        promoQty, promoAmount, baseQty, baseAmount,
        growthQtyPct: pct(promoQty, baseQty), growthAmountPct: pct(promoAmount, baseAmount),
        afterAvgPrice: afterAvg, priceStatus,
      };
    });

    const tPromoAmt = items.reduce((s, i) => s + i.promoAmount, 0);
    const tBaseAmt = items.reduce((s, i) => s + i.baseAmount, 0);
    const tPromoQty = items.reduce((s, i) => s + i.promoQty, 0);
    const tBaseQty = items.reduce((s, i) => s + i.baseQty, 0);

    return {
      ok: true,
      report: {
        campaign: {
          id: c.id, title: c.title, type: c.type, status: c.status,
          startDate: start, endDate: c.endDate ? ymd(c.endDate) : null,
          branchName: c.branch?.name ?? null,
        },
        periodStart: start, periodEnd: end, baseStart, baseEnd, hasAfter,
        items,
        totals: {
          promoAmount: tPromoAmt, baseAmount: tBaseAmt, growthAmountPct: pct(tPromoAmt, tBaseAmt),
          promoQty: tPromoQty, baseQty: tBaseQty, growthQtyPct: pct(tPromoQty, tBaseQty),
        },
      },
    };
  } catch (err) { return fail(err); }
}

function fail(err: unknown): Err {
  const msg = err instanceof Error ? err.message : "Xato.";
  if (msg.includes("Ruxsat")) return { ok: false, error: "Ruxsat yo'q." };
  return { ok: false, error: msg };
}
