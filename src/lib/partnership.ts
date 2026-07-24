/**
 * STRATEGIK HAMKORLIK — ta'minotchi skorkarti (gross-marja "sharshara"si).
 *
 * Har qatorda ta'minotchi bo'yicha davr agregatsiyasi + brend (agent) kesimida
 * yoyiladigan children. Ustunlar ikki turga bo'linadi:
 *
 *   QATTIQ (bazadan, so'rov vaqtida hisoblanadi — SAQLANMAYDI):
 *     oborot, marja, front%, SKU, ulush%, ABC.
 *   YUMSHOQ (orqa-marja — PartnershipScorecard override YOKI avto-taxmin):
 *     promo kompensatsiya, rassrochka marjasi, bonus, spisaniye.
 *
 *   Гросс% = front% + promo% + rassrochka% + bonus% + spisaniye%   (spisaniye manfiy)
 *
 * FRONT: marja = Σ(amount) − Σ(cost), cost = COALESCE(costPrice×soldQty, costAmount, 0);
 * davr-overlap va proratsiya analytics.ts naqshi bilan bir xil. front% = marja/oborot.
 * Bu tuzilishda marja/oborot = front% (rasmga mos), gross esa orqa-marjalar bilan yig'iladi.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { TAG_PARTNERSHIP } from "@/lib/cache-tags";
import { buildSupplierMatcher, type VozvratMatchConfidence } from "@/lib/vozvrat-supplier";
import { vozvratlarSpisaniyeAttrib } from "@/lib/spisaniya/db";

/** Kapital stavka (yillik %) — rassrochka avto-bahosida. AppSetting bilan sozlanadi. */
export const CAPITAL_RATE_SETTING_KEY = "capital_rate_yearly_pct";
const DEFAULT_CAPITAL_RATE_PCT = 24;

/** Qaysi yumshoq ustunlar QO'LDA kiritilgan (avto emas) — UI badge/tahrir uchun. */
export type SoftOverrideFlags = {
  promoComp: boolean;
  rassrochka: boolean;
  bonus: boolean;
  spisaniye: boolean;
  abc: boolean;
};

export type ScorecardRow = {
  supplierId: number;
  supplierName: string;
  /** NULL — ta'minotchi (asosiy) qatori; to'ldirilgan — brend (agent) child qatori. */
  agentId: number | null;
  brandName: string | null;
  abc: string;
  turnoverSharePct: number;
  skuCount: number;
  turnover: number;
  margin: number;
  frontPct: number;
  promoCompPct: number;
  rassrochkaPct: number;
  bonusPct: number;
  spisaniyePct: number;
  grossPct: number;
  overrides: SoftOverrideFlags;
  /** Spisaniye vozvratlardan attribut qilingan ishonch darajasi (override bo'lsa null). */
  spisaniyeConfidence: VozvratMatchConfidence | null;
  note: string | null;
  /** Brend (agent) kesimidagi yoyiladigan qatorlar (faqat ta'minotchi qatorida). */
  children?: ScorecardRow[];
};

export type ScorecardResult = {
  periodStart: string;
  periodEnd: string;
  capitalRatePct: number;
  totalTurnover: number;
  totalMargin: number;
  rows: ScorecardRow[];
};

const r2 = (n: number): number => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
/** Prisma Decimal → number|null (null = override kiritilmagan, 0 dan farqli). */
const dnum = (d: Prisma.Decimal | null | undefined): number | null => (d == null ? null : Number(d));

type DetailRow = { sup: number; agent: number | null; turnover: number; cost: number; sku: number };

async function _getPartnershipScorecard(periodStart: string, periodEnd: string): Promise<ScorecardResult> {
  const startDate = new Date(`${periodStart}T00:00:00.000Z`);
  const endDate = new Date(`${periodEnd}T00:00:00.000Z`);

  // Davr-overlap proratsiya ulushi (analytics.ts bilan bir xil).
  const frac = Prisma.sql`(
    (LEAST(ps."periodEnd", ${endDate}::date) - GREATEST(ps."periodStart", ${startDate}::date) + 1)::numeric
    / NULLIF((ps."periodEnd" - ps."periodStart" + 1), 0)::numeric
  )`;

  const [detail, xyzRows, suppliers, agents, overrides, capitalSetting, productCodes, spisAttrib] =
    await Promise.all([
      // 1. Ta'minotchi × brend (agent) kesimida oborot/tannarx/SKU — bitta skan.
      prisma.$queryRaw<DetailRow[]>`
        SELECT p."supplierId" AS sup, p."agentId" AS agent,
          COALESCE(SUM(ps."amount"::numeric * ${frac}), 0)::float8 AS turnover,
          COALESCE(SUM(COALESCE(ps."costPrice" * ps."soldQty", ps."costAmount", 0)::numeric * ${frac}), 0)::float8 AS cost,
          COUNT(DISTINCT ps."productId")::int AS sku
        FROM "ProductSales" ps
        JOIN "Product" p ON p.id = ps."productId"
        WHERE ps."periodStart" <= ${endDate}::date AND ps."periodEnd" >= ${startDate}::date
          AND p."supplierId" IS NOT NULL
        GROUP BY p."supplierId", p."agentId"
      `,
      // 2. Ta'minotchi darajasidagi XYZ (oborot-vaznli mod) — ABC ikkinchi harfi uchun.
      prisma.$queryRaw<{ sup: number; xyz: string | null; t: number }[]>`
        SELECT p."supplierId" AS sup, p."xyzClass" AS xyz,
          COALESCE(SUM(ps."amount"::numeric * ${frac}), 0)::float8 AS t
        FROM "ProductSales" ps
        JOIN "Product" p ON p.id = ps."productId"
        WHERE ps."periodStart" <= ${endDate}::date AND ps."periodEnd" >= ${startDate}::date
          AND p."supplierId" IS NOT NULL
        GROUP BY p."supplierId", p."xyzClass"
      `,
      prisma.supplier.findMany({ select: { id: true, name: true, retrobonusPct: true, otsrochkaDays: true } }),
      prisma.agent.findMany({ select: { id: true, supplierId: true, name: true } }),
      prisma.partnershipScorecard.findMany({ where: { periodStart: startDate, periodEnd: endDate } }),
      prisma.appSetting.findUnique({ where: { key: CAPITAL_RATE_SETTING_KEY } }),
      prisma.product.findMany({ select: { code: true, supplierId: true } }),
      vozvratlarSpisaniyeAttrib({ start: startDate, end: endDate }),
    ]);

  const capitalRatePct = capitalSetting?.value ? Number(capitalSetting.value) || DEFAULT_CAPITAL_RATE_PCT : DEFAULT_CAPITAL_RATE_PCT;

  // ── Meta indekslar ──
  const supMeta = new Map(suppliers.map((s) => [s.id, s]));
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const overrideByKey = new Map(overrides.map((o) => [`${o.supplierId}:${o.agentId ?? "null"}`, o]));

  // XYZ mod (eng katta oborotli non-null sinf) ta'minotchi bo'yicha.
  const xyzBest = new Map<number, { xyz: string; t: number }>();
  for (const r of xyzRows) {
    if (!r.xyz) continue;
    const cur = xyzBest.get(r.sup);
    if (!cur || r.t > cur.t) xyzBest.set(r.sup, { xyz: r.xyz, t: r.t });
  }

  // ── Spisaniye attribut (vozvratlar → supplier) ──
  const codeMap = new Map<number, number | null>();
  for (const p of productCodes) codeMap.set(p.code, p.supplierId);
  const matcher = buildSupplierMatcher(suppliers.map((s) => ({ id: s.id, name: s.name })), codeMap);
  const spisBySupplier = new Map<number, { summa: number; conf: VozvratMatchConfidence }>();
  for (const v of spisAttrib) {
    const m = matcher.match({ taminotchiId: v.taminotchi_id, skuKod: v.sku_kod, taminotchi: v.taminotchi });
    if (m.supplierId == null) continue;
    const cur = spisBySupplier.get(m.supplierId);
    if (!cur) {
      spisBySupplier.set(m.supplierId, { summa: v.summa, conf: m.confidence });
    } else {
      cur.summa += v.summa;
      // Bittasi ham "taxminiy" bo'lsa — butun ta'minotchi taxminiy.
      if (m.confidence === "taxminiy") cur.conf = "taxminiy";
    }
  }

  // ── Ta'minotchi bo'yicha guruhlash ──
  type SupAgg = { turnover: number; cost: number; agents: DetailRow[] };
  const bySupplier = new Map<number, SupAgg>();
  for (const d of detail) {
    let g = bySupplier.get(d.sup);
    if (!g) { g = { turnover: 0, cost: 0, agents: [] }; bySupplier.set(d.sup, g); }
    g.turnover += d.turnover;
    g.cost += d.cost;
    g.agents.push(d);
  }

  const totalTurnover = [...bySupplier.values()].reduce((s, g) => s + g.turnover, 0);
  const totalMargin = [...bySupplier.values()].reduce((s, g) => s + (g.turnover - g.cost), 0);

  // ── ABC (Pareto oborot bo'yicha) ──
  const supIdsByTurnover = [...bySupplier.entries()].sort((a, b) => b[1].turnover - a[1].turnover);
  const abcLetter = new Map<number, "A" | "B" | "C">();
  let cum = 0;
  for (const [id, g] of supIdsByTurnover) {
    cum += g.turnover;
    const share = totalTurnover > 0 ? (cum / totalTurnover) * 100 : 0;
    abcLetter.set(id, share <= 80 ? "A" : share <= 95 ? "B" : "C");
  }

  // Bir qator (yumshoq ustunlar + gross) yig'uvchi umumiy funksiya.
  const buildSoft = (opts: {
    supplierId: number;
    agentId: number | null;
    turnover: number;
    cost: number;
    frontPct: number;
    /** Faqat ta'minotchi qatorida vozvrat-attributi qo'llanadi. */
    autoSpisaniyePct: number;
    autoSpisConf: VozvratMatchConfidence | null;
  }) => {
    const meta = supMeta.get(opts.supplierId);
    const ov = overrideByKey.get(`${opts.supplierId}:${opts.agentId ?? "null"}`);
    const costRatio = opts.turnover > 0 ? opts.cost / opts.turnover : 0;
    const otsrochka = meta?.otsrochkaDays ?? 0;

    const autoBonus = meta?.retrobonusPct != null ? Number(meta.retrobonusPct) : 0;
    const autoRassrochka = otsrochka > 0 ? (otsrochka / 365) * capitalRatePct * costRatio : 0;
    const autoPromo = 0;

    const ovPromo = dnum(ov?.promoCompPct);
    const ovRassrochka = dnum(ov?.rassrochkaPct);
    const ovBonus = dnum(ov?.bonusPct);
    const ovSpis = dnum(ov?.spisaniyePct);

    const promoCompPct = r2(ovPromo ?? autoPromo);
    const rassrochkaPct = r2(ovRassrochka ?? autoRassrochka);
    const bonusPct = r2(ovBonus ?? autoBonus);
    const spisaniyePct = r2(ovSpis ?? opts.autoSpisaniyePct);
    const frontPct = r2(opts.frontPct);
    const grossPct = r2(frontPct + promoCompPct + rassrochkaPct + bonusPct + spisaniyePct);

    return {
      frontPct, promoCompPct, rassrochkaPct, bonusPct, spisaniyePct, grossPct,
      note: ov?.note ?? null,
      abcOverride: ov?.abcOverride ?? null,
      spisaniyeConfidence: ovSpis != null ? null : opts.autoSpisConf,
      overrides: {
        promoComp: ovPromo != null,
        rassrochka: ovRassrochka != null,
        bonus: ovBonus != null,
        spisaniye: ovSpis != null,
        abc: !!ov?.abcOverride,
      } satisfies SoftOverrideFlags,
    };
  };

  const rows: ScorecardRow[] = [];
  for (const [supplierId, g] of supIdsByTurnover) {
    const meta = supMeta.get(supplierId);
    const margin = g.turnover - g.cost;
    const frontPct = g.turnover > 0 ? (margin / g.turnover) * 100 : 0;
    const skuCount = g.agents.reduce((s, a) => s + a.sku, 0);

    const spis = spisBySupplier.get(supplierId);
    const autoSpisaniyePct = spis && g.turnover > 0 ? -(spis.summa / g.turnover) * 100 : 0;
    const autoSpisConf = spis ? spis.conf : null;

    const soft = buildSoft({ supplierId, agentId: null, turnover: g.turnover, cost: g.cost, frontPct, autoSpisaniyePct, autoSpisConf });

    // Brend (agent) children — oborot bo'yicha kamayuvchi.
    const children: ScorecardRow[] = g.agents
      .slice()
      .sort((a, b) => b.turnover - a.turnover)
      .map((a) => {
        const cMargin = a.turnover - a.cost;
        const cFront = a.turnover > 0 ? (cMargin / a.turnover) * 100 : 0;
        // Brend darajasida spisaniye attributi yo'q → avto 0 (override bo'lsa qo'llanadi).
        const cSoft = buildSoft({ supplierId, agentId: a.agent, turnover: a.turnover, cost: a.cost, frontPct: cFront, autoSpisaniyePct: 0, autoSpisConf: null });
        return {
          supplierId,
          supplierName: meta?.name ?? `#${supplierId}`,
          agentId: a.agent,
          brandName: a.agent != null ? agentName.get(a.agent) ?? `#${a.agent}` : "(brendsiz)",
          abc: cSoft.abcOverride ?? "",
          turnoverSharePct: totalTurnover > 0 ? r2((a.turnover / totalTurnover) * 100) : 0,
          skuCount: a.sku,
          turnover: a.turnover,
          margin: cMargin,
          frontPct: cSoft.frontPct,
          promoCompPct: cSoft.promoCompPct,
          rassrochkaPct: cSoft.rassrochkaPct,
          bonusPct: cSoft.bonusPct,
          spisaniyePct: cSoft.spisaniyePct,
          grossPct: cSoft.grossPct,
          overrides: cSoft.overrides,
          spisaniyeConfidence: cSoft.spisaniyeConfidence,
          note: cSoft.note,
        } satisfies ScorecardRow;
      });

    const abcComputed = (abcLetter.get(supplierId) ?? "C") + (xyzBest.get(supplierId)?.xyz ?? "");

    rows.push({
      supplierId,
      supplierName: meta?.name ?? `#${supplierId}`,
      agentId: null,
      brandName: null,
      abc: soft.abcOverride ?? abcComputed,
      turnoverSharePct: totalTurnover > 0 ? r2((g.turnover / totalTurnover) * 100) : 0,
      skuCount,
      turnover: g.turnover,
      margin,
      frontPct: soft.frontPct,
      promoCompPct: soft.promoCompPct,
      rassrochkaPct: soft.rassrochkaPct,
      bonusPct: soft.bonusPct,
      spisaniyePct: soft.spisaniyePct,
      grossPct: soft.grossPct,
      overrides: soft.overrides,
      spisaniyeConfidence: soft.spisaniyeConfidence,
      note: soft.note,
      children,
    });
  }

  return { periodStart, periodEnd, capitalRatePct, totalTurnover, totalMargin, rows };
}

/**
 * Davr bo'yicha strategik hamkorlik skorkarti. TAG_PARTNERSHIP bilan keshlanadi
 * (override saqlanganda invalidatsiya); spisaniye yangiligi uchun 10 daqiqa TTL.
 */
export function getPartnershipScorecard(periodStart: string, periodEnd: string): Promise<ScorecardResult> {
  return unstable_cache(
    () => _getPartnershipScorecard(periodStart, periodEnd),
    ["partnership-scorecard", periodStart, periodEnd],
    { tags: [TAG_PARTNERSHIP], revalidate: 600 }
  )();
}
