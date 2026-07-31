"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, type PromoType, type PromoStatus } from "@/generated/prisma/client";
import { requirePromoView } from "@/lib/auth-helpers";
import { isoDay, todayTashkentISO } from "@/lib/date";

// Promo hisobot — aksiya samaradorligini ProductSales (period kesimida sotuv)
// bilan o'lchaydi. 3 davr: aksiya davri, undan oldingi teng davr (baseline),
// undan keyingi teng davr (narx qaytdimi tekshiruvi). Period proratsiya
// (frac) — profit.ts naqshi bilan, davr chetidagi qisman yozuvlar uchun.

const DAY = 86_400_000;
const toUTC = (s: string) => new Date(s + "T00:00:00.000Z");
const addDays = (s: string, n: number) => isoDay(new Date(toUTC(s).getTime() + n * DAY));
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
  // N+M mexanika ("N ol, M tekin") — null bo'lmasa narx-chegirma emas (dona narxi o'zgarmagan).
  nPlusM: { buy: number; free: number } | null;
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
  /**
   * Marja va YALPI FOYDA. Sotuv o'sgani bilan aksiya o'zini oqlaganini bildirmaydi —
   * chegirma marjani yeydi. Shuning uchun asosiy o'lchov: yalpi foyda (so'mda) oshdimi.
   * `null` — tannarx (ProductSales.costAmount) ma'lum emas, hisoblab bo'lmaydi.
   */
  marja: MarjaBloki | null;
};

/**
 * Marja/foyda taqqoslash. Foiz emas, SO'M hal qiluvchi: marja foizi tushib, lekin
 * hajm shunchalik o'sgan bo'lsa — foyda baribir oshishi mumkin (va aksincha).
 *
 * MUTLAQ raqamlar (promoProfit/promoPct) TAQQOSLASHDAN ajratilgan. Ilgari baza
 * davrida sotuv bo'lmasa butun blok `null` qilinardi va bu ikki xatoga olib kelardi:
 * (1) yangi assortiment (aksiya bilan chiqarilgan tovar) jadvalda "—" bo'lib
 * SOTILMAGANDEK ko'rinardi; (2) uning sotuvi kampaniya JAMISIGA ham kirmasdi —
 * o'lchandi: aksiya 29 da 11 SKU, 1.68 mln so'm foyda hisobidan jimgina tushib
 * qolgan edi. Endi faqat TAQQOSLASH maydonlari (`delta`, `basePct`) null bo'ladi.
 */
export type MarjaBloki = {
  /** Tannarxi MA'LUM bo'lgan sotuv summasi (qamrov) — foiz shundan hisoblanadi. */
  promoCovered: number;
  baseCovered: number;
  promoCost: number;
  baseCost: number;
  promoPct: number | null; // marja % (aksiya davri) — bazaga BOG'LIQ EMAS
  basePct: number | null;
  promoProfit: number; // yalpi foyda (so'm) — bazaga BOG'LIQ EMAS
  baseProfit: number;
  /** `null` — baza davrida tannarxli sotuv yo'q, taqqoslab bo'lmaydi (yangi tovar). */
  delta: number | null;
  deltaPct: number | null;
  /** Tannarx qamrovi (0..1): 1 dan kichik bo'lsa raqamlar to'liq emas. */
  coverage: number;
  /** Yangi assortiment: baza davrida sotuv yo'q. Sotuvi JAMIGA baribir kiradi. */
  bazaYoq: boolean;
};

export type PromoReport = {
  campaign: ReportCampaignOpt & { branchName: string | null };
  periodStart: string;
  /** EFFEKTIV tugash — rejalashtirilgan sana emas, oxirgi TO'LIQ import kuni bilan kesilgan. */
  periodEnd: string;
  /** Rejalashtirilgan tugash (null — doimiy). Effektivdan farq qilsa hisobot chala. */
  plannedEnd: string | null;
  /** Ma'lumot qaysi kungacha to'liq mavjud. */
  dataThrough: string;
  /** Aksiya davri kesilganmi (davom etyapti yoki import kechikkan). */
  truncated: boolean;
  /** Taqqoslangan kunlar soni (aksiya ham, baza ham SHUNCHA kun). */
  days: number;
  baseStart: string;
  baseEnd: string;
  hasAfter: boolean; // aksiya tugaganmi (after davri mavjudmi)
  items: ReportItem[];
  totals: {
    promoAmount: number; baseAmount: number; growthAmountPct: number | null;
    promoQty: number; baseQty: number; growthQtyPct: number | null;
    marja: MarjaBloki | null;
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
        startDate: isoDay(c.startDate), endDate: c.endDate ? isoDay(c.endDate) : null,
      })),
    };
  } catch (err) { return fail(err); }
}

const pct = (cur: number, base: number): number | null => (base > 0 ? ((cur - base) / base) * 100 : null);

/**
 * Oxirgi TO'LIQ import kuni — barcha filiallar ma'lumot bergan eng so'nggi kun.
 *
 * NEGA "to'liq": kunlik import filialma-filial keladi va bittasi kechikishi mumkin.
 * Jonli misol: 2026-07-30 da Mega Center (eng katta filial, kuniga ~235 mln so'm)
 * umuman yo'q edi — o'sha kunni hisobga qo'shish aksiya sotuvini ~55% ga kamaytirib
 * ko'rsatardi. "Norma" — oxirgi 30 kundagi eng katta filial soni.
 */
async function oxirgiToliqKun(branchId: number | null): Promise<string | null> {
  // Filialga xos aksiyada "to'liq" — AYNI o'sha filial ma'lumot bergan kun
  // (boshqa filial kelib, shu filial kechiksa, kun to'liq HISOBLANMAYDI).
  const rows = await prisma.$queryRaw<{ kun: string | null }[]>`
    WITH kunlar AS (
      SELECT "periodStart" d, count(DISTINCT "branchId")::int filiallar
      FROM "ProductSales"
      WHERE "periodStart" >= (SELECT max("periodStart") FROM "ProductSales") - 30
        AND (${branchId}::int IS NULL OR "branchId" = ${branchId}::int)
      GROUP BY 1
    ), norma AS (SELECT max(filiallar) m FROM kunlar)
    SELECT max(d)::text AS kun FROM kunlar, norma WHERE kunlar.filiallar >= norma.m
  `;
  return rows[0]?.kun ?? null;
}

/**
 * Marja bloki. Qamrov (`covered`) — tannarxi ma'lum sotuv summasi; foiz va foyda
 * SHUNDAN hisoblanadi, aks holda tannarxsiz qatorlar marjani ko'tarib yuborardi.
 */
function marjaHisobla(
  promoCovered: number, promoCost: number,
  baseCovered: number, baseCost: number,
  promoAmount: number, baseAmount: number
): MarjaBloki | null {
  // FAQAT aksiya davrida tannarxli sotuv bo'lmasa — o'lchanadigan narsa yo'q.
  // (Asl holat: aksiya bugun boshlangan, sotuv importi hali kelmagan — u paytda
  // promoProfit = 0 bo'lib "aksiya o'zini oqlamadi" degan yolg'on xulosa chiqardi.)
  if (promoCovered <= 0) return null;
  const bazaYoq = baseCovered <= 0;
  const promoProfit = promoCovered - promoCost;
  const baseProfit = baseCovered - baseCost;
  const jamiAmount = promoAmount + baseAmount;
  return {
    promoCovered, baseCovered, promoCost, baseCost,
    promoPct: (promoProfit / promoCovered) * 100,
    basePct: bazaYoq ? null : (baseProfit / baseCovered) * 100,
    promoProfit,
    baseProfit,
    // Taqqoslash FAQAT ikkala davrda ham o'lchov bo'lganda
    delta: bazaYoq ? null : promoProfit - baseProfit,
    deltaPct: !bazaYoq && baseProfit > 0 ? ((promoProfit - baseProfit) / baseProfit) * 100 : null,
    coverage: jamiAmount > 0 ? (promoCovered + baseCovered) / jamiAmount : 0,
    bazaYoq,
  };
}

export async function promoReportAction(input: { campaignId: number }): Promise<{ ok: true; report: PromoReport } | Err> {
  try {
    await requirePromoView();
    const campaignId = z.coerce.number().int().positive().parse(input.campaignId);

    const c = await prisma.promoCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true, title: true, type: true, status: true, startDate: true, endDate: true, branchId: true,
        branch: { select: { name: true } },
        items: { select: { productId: true, regularPrice: true, promoPrice: true, buyQty: true, freeQty: true, product: { select: { name: true, code: true } } } },
      },
    });
    if (!c) return { ok: false, error: "Aksiya topilmadi." };

    const start = isoDay(c.startDate);
    const todayStr = todayTashkentISO();
    const plannedEnd = c.endDate ? isoDay(c.endDate) : null;

    // EFFEKTIV tugash = reja va MA'LUMOT bor kunning kichigi. Ilgari rejalashtirilgan
    // sana o'zgarishsiz olinardi: davom etayotgan aksiyada 1 kunlik sotuv 8 kunlik baza
    // bilan solishtirilib, pasayish ~4 barobar oshib ko'rinardi (jonli misol: aksiya 36).
    const dataThrough = (await oxirgiToliqKun(c.branchId)) ?? todayStr;
    const rejaEnd = plannedEnd ?? todayStr;
    const end = rejaEnd < dataThrough ? rejaEnd : dataThrough;
    const truncated = end < rejaEnd;

    // Ma'lumot aksiya boshlanishidan oldin tugagan bo'lsa — o'lchaydigan narsa yo'q.
    if (end < start) {
      return {
        ok: true,
        report: {
          campaign: {
            id: c.id, title: c.title, type: c.type, status: c.status,
            startDate: start, endDate: plannedEnd, branchName: c.branch?.name ?? null,
          },
          periodStart: start, periodEnd: start, plannedEnd, dataThrough, truncated: true, days: 0,
          baseStart: start, baseEnd: start, hasAfter: false, items: [],
          totals: {
            promoAmount: 0, baseAmount: 0, growthAmountPct: null,
            promoQty: 0, baseQty: 0, growthQtyPct: null, marja: null,
          },
        },
      };
    }

    // Baza AYNI uzunlikda — teng bo'lmagan oynalarni taqqoslash asosiy xato edi
    const len = Math.max(1, diffDays(start, end) + 1);
    const baseStart = addDays(start, -len);
    const baseEnd = addDays(start, -1);
    const afterStart = addDays(end, 1);
    const afterEnd = addDays(end, len);
    // "Narx qaytdimi" faqat aksiya TUGAGAN va keyingi davrda ma'lumot bo'lsa
    const hasAfter = plannedEnd != null && plannedEnd < dataThrough;

    const pids = c.items.map((i) => i.productId);
    const branchSql = c.branchId ? Prisma.sql`AND ps."branchId" = ${c.branchId}` : Prisma.empty;

    // Har SKU bo'yicha 3 davr sotuvi (proratsiya frac bilan). pids bo'sh bo'lsa so'rov yo'q.
    type Row = {
      pid: number; promo_qty: number; promo_amt: number; base_qty: number; base_amt: number;
      after_qty: number; after_amt: number;
      // Marja: tannarxi MA'LUM qatorlar bo'yicha (costAmount NULL bo'lsa qator hisobga olinmaydi —
      // aks holda tannarxsiz sotuv marjani 100% qilib ko'rsatardi).
      promo_cov: number; promo_cost: number; base_cov: number; base_cost: number;
    };
    const rows: Row[] = pids.length === 0 ? [] : await prisma.$queryRaw<Row[]>`
      SELECT ps."productId" AS pid,
        SUM(ps."soldQty" * fr.f_promo)::float8 AS promo_qty,
        SUM(ps.amount    * fr.f_promo)::float8 AS promo_amt,
        SUM(ps."soldQty" * fr.f_base)::float8  AS base_qty,
        SUM(ps.amount    * fr.f_base)::float8  AS base_amt,
        SUM(ps."soldQty" * fr.f_after)::float8 AS after_qty,
        SUM(ps.amount    * fr.f_after)::float8 AS after_amt,
        SUM(CASE WHEN ps."costAmount" IS NOT NULL THEN ps.amount ELSE 0 END * fr.f_promo)::float8 AS promo_cov,
        SUM(COALESCE(ps."costAmount", 0) * fr.f_promo)::float8 AS promo_cost,
        SUM(CASE WHEN ps."costAmount" IS NOT NULL THEN ps.amount ELSE 0 END * fr.f_base)::float8  AS base_cov,
        SUM(COALESCE(ps."costAmount", 0) * fr.f_base)::float8  AS base_cost
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
      const isNM = it.buyQty != null && it.freeQty != null;
      // Narx asliga qaytdimi? after o'rtacha narx regularga yaqin (±5%) → qaytdi; promoga yaqin → qoldi.
      // N+M da dona narxi tushmaydi (promo=reg) — narx-qaytish tekshiruvi ma'nosiz, "unknown" qoladi.
      let priceStatus: ReportItem["priceStatus"] = "unknown";
      if (!isNM && afterAvg != null && reg > 0) {
        const dReg = Math.abs(afterAvg - reg) / reg;
        const dPromo = promo > 0 ? Math.abs(afterAvg - promo) / promo : Infinity;
        priceStatus = dReg <= 0.05 ? "returned" : dPromo <= 0.05 ? "stuck" : afterAvg >= reg * 0.95 ? "returned" : "stuck";
      }
      const marja = marjaHisobla(
        r ? r.promo_cov : 0, r ? r.promo_cost : 0,
        r ? r.base_cov : 0, r ? r.base_cost : 0,
        promoAmount, baseAmount
      );
      return {
        productId: it.productId, name: it.product.name, code: it.product.code,
        regularPrice: reg, promoPrice: promo,
        nPlusM: isNM ? { buy: it.buyQty!, free: it.freeQty! } : null,
        promoQty, promoAmount, baseQty, baseAmount,
        growthQtyPct: pct(promoQty, baseQty), growthAmountPct: pct(promoAmount, baseAmount),
        afterAvgPrice: afterAvg, priceStatus, marja,
      };
    });

    const tPromoAmt = items.reduce((s, i) => s + i.promoAmount, 0);
    const tBaseAmt = items.reduce((s, i) => s + i.baseAmount, 0);
    const tPromoQty = items.reduce((s, i) => s + i.promoQty, 0);
    const tBaseQty = items.reduce((s, i) => s + i.baseQty, 0);
    // JAMI — XOM qatorlardan. Ilgari `i.marja?.x ?? 0` dan yig'ilardi, ya'ni marja
    // bloki `null` bo'lgan SKU (bazasi yo'q yangi tovar) jamiga NOL qo'shardi va
    // uning haqiqiy sotuvi kampaniya foydasidan jimgina tushib qolardi.
    const tMarja = marjaHisobla(
      rows.reduce((s, r) => s + (Number(r.promo_cov) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.promo_cost) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.base_cov) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.base_cost) || 0), 0),
      tPromoAmt, tBaseAmt
    );

    return {
      ok: true,
      report: {
        campaign: {
          id: c.id, title: c.title, type: c.type, status: c.status,
          startDate: start, endDate: plannedEnd,
          branchName: c.branch?.name ?? null,
        },
        periodStart: start, periodEnd: end, plannedEnd, dataThrough, truncated, days: len,
        baseStart, baseEnd, hasAfter,
        items,
        totals: {
          promoAmount: tPromoAmt, baseAmount: tBaseAmt, growthAmountPct: pct(tPromoAmt, tBaseAmt),
          promoQty: tPromoQty, baseQty: tBaseQty, growthQtyPct: pct(tPromoQty, tBaseQty),
          marja: tMarja,
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
