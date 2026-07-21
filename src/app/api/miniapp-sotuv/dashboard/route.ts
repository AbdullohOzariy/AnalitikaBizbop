/**
 * BizbopSotuv Mini App: sotuv hisobot ma'lumotlari — KPI, filiallar kesimi,
 * marja (guruh bo'yicha) va Reja-Fakt. Filial qamrovi (UserBranch) QAT'IY:
 * ro'yxat bo'lsa jami KPI ham faqat o'sha filiallar yig'indisidan hisoblanadi.
 *
 * Savdo manbai: dailySalesByGroup(range, branchId) — filial boshiga alohida
 * chaqiriladi (keshlangan, filial soni kichik), chunki jami seriya filial
 * kesimini bermaydi. Cheklar — kpiByBranch(range) dan.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateParam, isoDay } from "@/lib/date";
import { getDefaultRange, type DateRange } from "@/lib/analytics";
import {
  kpiByBranch,
  dailySalesByGroup,
  dailyPlanByGroup,
  marjaHierarchy,
} from "@/lib/analytics-v2";
import { authMiniapp, branchInScope, miniappXato } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarjaOut = { name: string; marja: number | null; sales: number };

/** Guruh marjasi: bitta filial/cheklovsiz — to'g'ridan-to'g'ri; qamrov — filiallar bo'yicha yig'ib. */
async function marjaByGroup(range: DateRange, scopeIds: number[] | null): Promise<MarjaOut[]> {
  if (scopeIds === null) {
    const nodes = await marjaHierarchy(range);
    return nodes.map((n) => ({ name: n.name, marja: n.marja, sales: n.sales }));
  }
  if (scopeIds.length === 0) return [];
  if (scopeIds.length === 1) {
    const nodes = await marjaHierarchy(range, scopeIds[0]);
    return nodes.map((n) => ({ name: n.name, marja: n.marja, sales: n.sales }));
  }
  // Bir nechta qamrov-filial: har biri uchun alohida (keshlangan), so'ng guruh bo'yicha yig'amiz.
  const perBranch = await Promise.all(scopeIds.map((b) => marjaHierarchy(range, b)));
  const acc = new Map<number, { name: string; sales: number; cost: number }>();
  for (const nodes of perBranch) {
    for (const n of nodes) {
      const a = acc.get(n.id) ?? { name: n.name, sales: 0, cost: 0 };
      a.sales += n.sales;
      a.cost += n.cost;
      acc.set(n.id, a);
    }
  }
  return [...acc.values()].map((g) => ({
    name: g.name,
    marja: g.sales > 0 ? ((g.sales - g.cost) / g.sales) * 100 : null,
    sales: g.sales,
  }));
}

export async function GET(req: Request) {
  const auth = await authMiniapp(req, "dash");
  if ("fail" in auth) return auth.fail;
  const { user } = auth;

  const url = new URL(req.url);
  const def = await getDefaultRange();
  const range: DateRange = {
    start: parseDateParam(url.searchParams.get("start")) ?? def.start,
    end: parseDateParam(url.searchParams.get("end")) ?? def.end,
  };
  if (range.start.getTime() > range.end.getTime()) {
    return miniappXato("Sana oralig'i noto'g'ri.", 400);
  }

  // Ixtiyoriy filial filtri — foydalanuvchi qamrovida bo'lishi shart.
  const branchIdRaw = url.searchParams.get("branchId");
  let branchId: number | undefined;
  if (branchIdRaw) {
    const n = Number(branchIdRaw);
    if (!Number.isInteger(n) || n <= 0) return miniappXato("Filial noto'g'ri.", 400);
    if (!branchInScope(user.branchIds, n)) {
      return miniappXato("Bu filial sizning qamrovingizda emas.", 403);
    }
    branchId = n;
  }

  // Barcha filiallar KPI'si (cheklar/tashriflar) — so'ng qamrovga filtrlaymiz.
  const kpiRows = await kpiByBranch(range);
  const scopeIds = branchId ? [branchId] : (user.branchIds ?? kpiRows.map((r) => r.branchId));
  const scopeRows = kpiRows.filter((r) => scopeIds.includes(r.branchId));

  // Cheklovsizmi (na filtr, na qamrov) — marja/reja uchun bitta jami so'rov kifoya.
  const unrestricted = !branchId && user.branchIds === null;

  const [salesPerBranch, marja, planTotal, lastPs] = await Promise.all([
    // Har qamrov-filial savdosi (keshlangan — sekinlik muammo emas). Ma'lumot yo'q = 0.
    Promise.all(
      scopeRows.map(async (r) => {
        const g = await dailySalesByGroup(range, r.branchId);
        // `days` baribir olinadi — kunlik seriyani qaytarish qo'shimcha so'rov
        // talab qilmaydi (miniapp hero'sidagi sparkline uchun).
        return {
          branchId: r.branchId,
          sales: g.days.reduce((s, d) => s + d.total, 0),
          days: g.days.map((d) => d.total),
        };
      })
    ),
    marjaByGroup(range, unrestricted ? null : branchId ? [branchId] : scopeIds),
    (async () => {
      if (unrestricted) {
        const p = await dailyPlanByGroup(range);
        return p.days.reduce((s, d) => s + d.total, 0);
      }
      const per = await Promise.all(scopeIds.map((b) => dailyPlanByGroup(range, b)));
      return per.reduce((s, p) => s + p.days.reduce((x, d) => x + d.total, 0), 0);
    })(),
    // So'nggi mavjud ma'lumot kuni — "Bugun" hali kelmagan bo'lsa UI shu kunni taklif qiladi.
    prisma.productSales.aggregate({ _max: { periodEnd: true } }).catch(() => null),
  ]);

  const salesMap = new Map(salesPerBranch.map((s) => [s.branchId, s.sales]));

  /* Qamrovdagi filiallarning kunlik savdosi yig'indisi. Barcha `days`
     massivlari bir xil `range` dan kelgani uchun uzunligi bir xil. */
  const kunSoni = salesPerBranch[0]?.days.length ?? 0;
  const series = Array.from({ length: kunSoni }, (_, i) =>
    salesPerBranch.reduce((s, b) => s + (b.days[i] ?? 0), 0)
  );
  const totalSales = salesPerBranch.reduce((s, b) => s + b.sales, 0);
  const totalReceipts = scopeRows.reduce((s, r) => s + r.receipts, 0);

  const branches = scopeRows.map((r) => {
    const sales = salesMap.get(r.branchId) ?? 0;
    return {
      id: r.branchId,
      name: r.branchName,
      sales,
      receipts: r.receipts,
      share: totalSales > 0 ? (sales / totalSales) * 100 : 0,
    };
  });

  return NextResponse.json({
    ok: true,
    kpi: {
      sales: totalSales,
      receipts: totalReceipts,
      avgReceipt: totalReceipts > 0 ? totalSales / totalReceipts : 0,
    },
    branches,
    // Kunlik savdo dinamikasi (hero sparkline) — "Bugun" da 1 nuqta, UI uni ko'rsatmaydi
    series,
    marja,
    plan: {
      plan: planTotal,
      fakt: totalSales,
      percent: planTotal > 0 ? (totalSales / planTotal) * 100 : 0,
    },
    // So'nggi mavjud kun (YYYY-MM-DD) — bo'sh davr UI'sida "ma'lumot shu kungacha" ko'rsatiladi.
    lastDataDay: lastPs?._max.periodEnd ? isoDay(lastPs._max.periodEnd) : null,
  });
}
