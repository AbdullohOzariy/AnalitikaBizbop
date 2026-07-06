import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { isAdminTier } from "@/lib/roles";
import { parseDateParam, isoDay } from "@/lib/date";
import {
  computeKPI,
  branchPerformance,
  topCategories,
  dailySalesSeries,
  dailyReceiptsSeries,
  dailyVisitsSeries,
  getDefaultRange,
} from "@/lib/analytics";

async function handleGET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!isAdminTier(session.user.roles)) return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const def = await getDefaultRange();
  const start = parseDateParam(sp.get("start"), def.start)!;
  const end = parseDateParam(sp.get("end"), def.end)!;
  const branchId = sp.get("branchId") ? Number(sp.get("branchId")) : undefined;
  const range = { start, end };

  const [kpi, perf, top, sales, receipts, visits] = await Promise.all([
    computeKPI(range, branchId),
    branchPerformance(range),
    topCategories(range, branchId, 18),
    dailySalesSeries(range, branchId),
    dailyReceiptsSeries(range, branchId),
    dailyVisitsSeries(range, branchId),
  ]);

  const wb = XLSX.utils.book_new();

  // KPI varaq
  const kpiRows = [
    ["Davr", `${isoDay(start)} – ${isoDay(end)}`],
    [],
    ["Ko'rsatkich", "Qiymat"],
    ["Umumiy Savdo (UZS)", kpi.totalSales],
    ["Tashriflar Soni", kpi.totalVisits],
    ["Cheklar Soni", kpi.totalReceipts],
    ["O'rtacha Chek (UZS)", kpi.avgReceipt],
    ["Konversiya (%)", kpi.conversion],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), "KPI");

  // Filiallar Faoliyati
  const perfHeader = [
    "Filial",
    "Savdo",
    "Tashriflar",
    "Cheklar",
    "O'rtacha chek",
    "Konversiya %",
  ];
  const perfRows = perf.map((r) => [
    r.branchName,
    r.sales,
    r.visits,
    r.receipts,
    r.avgReceipt,
    r.conversion,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([perfHeader, ...perfRows]),
    "Filiallar"
  );

  // Top Kategoriyalar
  const topHeader = ["Kategoriya", "Fakt"];
  const topRows = top.map((c) => [c.categoryName, c.fact]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([topHeader, ...topRows]),
    "Kategoriyalar"
  );

  // Kunlik dinamika
  const dailyHeader = ["Sana", "Savdo (UZS)", "Cheklar", "Tashriflar"];
  const dateMap = new Map<string, { sales: number; receipts: number; visits: number }>();
  for (const r of sales) {
    const cur = dateMap.get(r.date) ?? { sales: 0, receipts: 0, visits: 0 };
    cur.sales = r.value;
    dateMap.set(r.date, cur);
  }
  for (const r of receipts) {
    const cur = dateMap.get(r.date) ?? { sales: 0, receipts: 0, visits: 0 };
    cur.receipts = r.value;
    dateMap.set(r.date, cur);
  }
  for (const r of visits) {
    const cur = dateMap.get(r.date) ?? { sales: 0, receipts: 0, visits: 0 };
    cur.visits = r.value;
    dateMap.set(r.date, cur);
  }
  const dailyRows = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => [date, v.sales, v.receipts, v.visits]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([dailyHeader, ...dailyRows]),
    "Kunlik"
  );

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `analitika-${isoDay(start)}_${isoDay(end)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Kutilmagan xatoda yalang'och 500 o'rniga log + tushunarli javob (L18).
export async function GET(...args: Parameters<typeof handleGET>) {
  try {
    return await handleGET(...args);
  } catch (err) {
    console.error("[api/export]", err instanceof Error ? err.message : err);
    return new Response("Eksport tayyorlashda xato. Birozdan so'ng qayta urinib ko'ring.", { status: 500 });
  }
}
