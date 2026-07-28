/**
 * Chiqim rejasi nazorati — chiqimning SAVDOGA nisbatan ulushi (%) reja bilan taqqoslanadi.
 *
 *   fakt % = chiqim / sotuv × 100
 *
 * Sotuv va chiqim `computeProfitTree` dan olinadi (sotuv: ProductSales period proratsiyasi;
 * chiqim: bizbop yozuvlari → SpisaniyaCategoryLink → subkat). Chiqim BARCHA turlarni
 * (spisaniya, vozvrat, kafe, ovqatlanish, ichki sotuv) qamraydi — chiqimByKategoriya tur
 * bo'yicha filtrlamaydi.
 *
 * Reja: `WriteoffPlan` (filial × subkategoriya, vaqtsiz). Kategoriya/bo'lim/umumiy daraja —
 * subkat rejalaridan SAVDO bilan vaznlangan rollup: planAmount = Σ(sales_i × plan_i/100),
 * planPct = planAmount / sales × 100. Reja qo'yilmagan subkatlar planAmount'ga 0 qo'shadi —
 * shu sabab har qatorda `coverage` (reja qamrovi) ham qaytariladi.
 *
 * Kompaniya bo'yicha UMUMIY chegara qo'lda qo'yiladi (AppSetting) va rollup bilan yonma-yon
 * nazorat qilinadi: rollup umumiy chegaradan oshsa — subkat rejalari o'zaro ziddiyatli.
 */
import { prisma } from "@/lib/prisma";
import { computeProfitTree } from "./profit";
import type { ChiqimRange } from "./db";

export const WRITEOFF_TOTAL_PLAN_KEY = "writeoff_plan_total_pct";

/** Rejadan qancha oshsa "sariq" (ogohlantirish) hisoblanadi; undan yuqorisi — "qizil". */
export const WARN_FACTOR = 1.2;

export type WoStatus = "ok" | "warn" | "over" | "none";

export type WoNode = {
  id: number;
  name: string;
  sales: number;
  writeoff: number;
  /** chiqim / sotuv × 100 — sotuv 0 bo'lsa null */
  factPct: number | null;
  /** subkat: WriteoffPlan.pct; yuqori darajalar: savdo bilan vaznlangan rollup */
  planPct: number | null;
  /** ruxsat etilgan chiqim summasi (so'm) */
  planAmount: number | null;
  /** chiqim − planAmount; musbat = rejadan oshgan summa */
  diffAmount: number | null;
  /** reja qo'yilgan savdoning ulushi (0..1) — 1 dan kichik bo'lsa reja to'liq emas */
  coverage: number;
  status: WoStatus;
};

export type WoSub = WoNode & { hasPlan: boolean };
export type WoCat = WoNode & { subcats: WoSub[] };
export type WoGroup = WoNode & { cats: WoCat[] };

export type WriteoffControl = {
  groups: WoGroup[];
  /** barcha bo'limlar yig'indisi (rollup reja bilan) */
  total: WoNode;
  /** qo'lda qo'yilgan kompaniya chegarasi (%) — qo'yilmagan bo'lsa null */
  totalPlanPct: number | null;
  /** umumiy chegara bo'yicha holat (fakt vs qo'lda qo'yilgan chegara) */
  totalStatus: WoStatus;
  /** subkatga bog'lanmagan chiqim (nazoratga kirmaydi) */
  unmappedWriteoff: number;
};

function statusOf(sales: number, writeoff: number, factPct: number | null, planPct: number | null): WoStatus {
  if (planPct == null || planPct <= 0) return "none";
  // Sotuvsiz davr: chiqim bo'lsa har qanday reja buzilgan, aks holda muammo yo'q.
  if (sales <= 0) return writeoff > 0 ? "over" : "ok";
  if (factPct == null) return "ok";
  if (factPct <= planPct) return "ok";
  if (factPct <= planPct * WARN_FACTOR) return "warn";
  return "over";
}

function mkNode(
  id: number,
  name: string,
  sales: number,
  writeoff: number,
  planAmount: number | null,
  coveredSales: number
): WoNode {
  const factPct = sales > 0 ? (writeoff / sales) * 100 : null;
  const planPct = planAmount != null && sales > 0 ? (planAmount / sales) * 100 : null;
  return {
    id,
    name,
    sales,
    writeoff,
    factPct,
    planPct,
    planAmount,
    diffAmount: planAmount != null ? writeoff - planAmount : null,
    coverage: sales > 0 ? Math.min(coveredSales / sales, 1) : 0,
    status: statusOf(sales, writeoff, factPct, planPct),
  };
}

/** Bolalardan reja summasini yig'adi — hech birida reja yo'q bo'lsa null (0 emas). */
function sumPlan(children: WoNode[]): { planAmount: number | null; coveredSales: number } {
  let planAmount = 0;
  let coveredSales = 0;
  let any = false;
  for (const c of children) {
    if (c.planAmount == null) continue;
    any = true;
    planAmount += c.planAmount;
    coveredSales += c.coverage * c.sales;
  }
  return { planAmount: any ? planAmount : null, coveredSales };
}

/**
 * Nazorat daraxti. `branchId` berilmasa — barcha filiallar; bu holda subkat reja %
 * filiallar bo'yicha O'RTACHA olinadi (MarginPlan bilan bir xil yondashuv).
 */
export async function computeWriteoffControl(
  range: ChiqimRange,
  branchId?: number
): Promise<WriteoffControl> {
  const [tree, planByCid, totalSetting] = await Promise.all([
    computeProfitTree(range, branchId),
    loadPlans(branchId),
    prisma.appSetting.findUnique({ where: { key: WRITEOFF_TOTAL_PLAN_KEY } }),
  ]);

  const groups: WoGroup[] = tree.groups.map((g) => {
    const cats: WoCat[] = g.cats.map((c) => {
      const subcats: WoSub[] = c.subcats.map((s) => {
        const pct = planByCid.get(s.id) ?? null;
        const planAmount = pct != null ? (s.sales * pct) / 100 : null;
        return {
          ...mkNode(s.id, s.name, s.sales, s.writeoff, planAmount, pct != null ? s.sales : 0),
          hasPlan: pct != null,
        };
      });
      const agg = sumPlan(subcats);
      return { ...mkNode(c.id, c.name, c.sales, c.writeoff, agg.planAmount, agg.coveredSales), subcats };
    });
    const agg = sumPlan(cats);
    return { ...mkNode(g.id, g.name, g.sales, g.writeoff, agg.planAmount, agg.coveredSales), cats };
  });

  const agg = sumPlan(groups);
  const total = mkNode(0, "Umumiy", tree.total.sales, tree.total.writeoff, agg.planAmount, agg.coveredSales);

  const totalPlanPct = totalSetting ? Number(totalSetting.value) : null;
  const totalPlanValid = totalPlanPct != null && Number.isFinite(totalPlanPct) ? totalPlanPct : null;

  return {
    groups,
    total,
    totalPlanPct: totalPlanValid,
    totalStatus: statusOf(total.sales, total.writeoff, total.factPct, totalPlanValid),
    unmappedWriteoff: tree.unmappedWriteoff,
  };
}

async function loadPlans(branchId?: number): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (branchId) {
    const rows = await prisma.writeoffPlan.findMany({
      where: { branchId },
      select: { categoryId: true, pct: true },
    });
    for (const r of rows) map.set(r.categoryId, Number(r.pct));
  } else {
    const rows = await prisma.writeoffPlan.groupBy({ by: ["categoryId"], _avg: { pct: true } });
    for (const r of rows) if (r._avg.pct != null) map.set(r.categoryId, Number(r._avg.pct));
  }
  return map;
}
