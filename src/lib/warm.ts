/**
 * Kesh isitish — fayl yuklangach (tag invalidatsiyadan keyin) va server start'da
 * asosiy sahifalarning default-davr keshlarini fonda oldindan to'ldiradi.
 * Maqsad: birinchi kirgan foydalanuvchi hech qachon og'ir hisobni kutmasin.
 *
 * Faqat default filtrlarni isitamiz (davr=default, filial=hammasi) — bu eng ko'p
 * ochiladigan kombinatsiya; boshqa filtrlar tabiiy ravishda talab bo'yicha hisoblanadi.
 */
import {
  getDefaultRange,
  computeKPI,
  dailySalesSeries,
  dailyReceiptsSeries,
  dailyVisitsSeries,
  branchShare,
  topCategories,
  branchPerformance,
  findMissingDays,
} from "@/lib/analytics";
import {
  dailyVisitsByBranch,
  dailyReceiptsByBranch,
  marjaBreakdown,
  marjaHierarchy,
  kpiByBranch,
  dailySalesByGroup,
  dailyPlanByGroup,
} from "@/lib/analytics-v2";
import { dailyForecastSeries } from "@/lib/forecast";
import { computeAbcXyz, abcDefaultStart } from "@/lib/abc-xyz";
import { computeSupplierAbc } from "@/lib/supplier-abc";
import { oosKpi, oosTreeAgg, stockdayKpi, stockdayTreeAgg } from "@/lib/snapshot-reports";
import { isoDay } from "@/lib/date";

/** Thunk'larni ko'pi bilan `limit` ta bir vaqtda ishlatadi (Promise.allSettled semantikasi). */
async function runLimited(
  thunks: (() => Promise<unknown>)[],
  limit: number
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = new Array(thunks.length);
  let idx = 0;
  const worker = async () => {
    while (idx < thunks.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await thunks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return results;
}

export async function warmAnalyticsCaches(reason: string): Promise<void> {
  const t0 = Date.now();
  try {
    const def = await getDefaultRange();
    const startStr = isoDay(def.start);
    const endStr = isoDay(def.end);
    // ABC/XYZ default davri — sahifadagi bilan bir manba (abcDefaultStart): oxirgi 3 oy
    const abcStart = isoDay(abcDefaultStart(def.end));
    const snap = { startStr, endStr, q: "" };
    const todayStr = isoDay(new Date());

    // Cheklangan parallelizm (4): isitish fon ishi — pool (max 10) ni to'yintirib,
    // shu paytdagi foydalanuvchi so'rovlarini 'timeout'ga uchratmaslik uchun.
    const results = await runLimited([
      // Dashboard v1
      () => computeKPI(def),
      () => dailySalesSeries(def),
      () => dailyReceiptsSeries(def),
      () => dailyVisitsSeries(def),
      () => branchShare(def),
      () => topCategories(def),
      () => branchPerformance(def),
      () => findMissingDays(def),
      // Dashboard v2
      () => dailyVisitsByBranch(def),
      () => dailyReceiptsByBranch(def),
      () => marjaBreakdown(def),
      () => marjaHierarchy(def),
      () => kpiByBranch(def),
      () => dailySalesByGroup(def),
      () => dailyPlanByGroup(def),
      () => dailyForecastSeries(def),
      // ABC/XYZ (default 3 oy)
      () => computeAbcXyz(abcStart, endStr),
      // Postavshiklar ABC — SKU tahliliyu bir xil oyna
      () => computeSupplierAbc(abcStart, endStr),
      // OOS / Stockday — KPI + daraxt agregati (default tab)
      () => oosKpi(snap),
      () => oosTreeAgg(snap, "oos"),
      () => stockdayKpi(snap, todayStr),
      () => stockdayTreeAgg(snap, "kritik", todayStr),
    ], 4);

    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(
      `[warm] Kesh isitildi (${reason}): ${results.length - failed}/${results.length} ta, ${Date.now() - t0}ms`
    );
    if (failed > 0) {
      for (const r of results) {
        if (r.status === "rejected")
          console.warn("[warm] xato:", r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }
  } catch (err) {
    console.warn("[warm] isitish yiqildi:", err instanceof Error ? err.message : err);
  }
}
