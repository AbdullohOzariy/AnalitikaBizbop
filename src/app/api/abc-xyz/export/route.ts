import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { isoDay, parseDateParam } from "@/lib/date";
import { computeAbcXyz, buildMatrix, abcDefaultStart, CELL_STRATEGY } from "@/lib/abc-xyz";

async function handleGET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!canSeeAnalytics(session.user.roles)) return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  // Default davr — page.tsx bilan bir manba: ma'lumotli oxirgi oy + oldingi 2 oy (XYZ uchun tarix).
  const def = await getDefaultRange();
  const startDate = parseDateParam(sp.get("start")) ?? abcDefaultStart(def.end);
  const endDate = parseDateParam(sp.get("end")) ?? def.end;
  const startStr = isoDay(startDate);
  const endStr = isoDay(endDate);
  const branchId = sp.get("branchId") ? parseInt(sp.get("branchId")!) : undefined;

  const [result, branch] = await Promise.all([
    computeAbcXyz(startStr, endStr, branchId),
    branchId
      ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const wb = XLSX.utils.book_new();

  // ── 1. SKU ro'yxati (savdo bo'yicha kamayish tartibida) ────────────────────
  const skuHeader = [
    "Kod", "Mahsulot", "Guruh", "Kategoriya", "Subkategoriya",
    "Savdo (so'm)", "Sotilgan (dona)", "Ulush %", "Kumulyativ %", "CV %",
    "ABC", "XYZ", "Sinf",
  ];
  const skuRows = result.rows.map((r) => [
    r.code,
    r.name,
    r.groupName ?? "Moslanmagan",
    r.catName ?? "Moslanmagan",
    r.subName ?? "Moslanmagan",
    Math.round(r.total),
    Number(r.qty.toFixed(2)),
    Number((r.share * 100).toFixed(2)),
    Number((r.cum * 100).toFixed(2)),
    Number((r.cv * 100).toFixed(1)),
    r.abc,
    r.xyz,
    `${r.abc}${r.xyz}`,
  ]);
  const skuWs = XLSX.utils.aoa_to_sheet([skuHeader, ...skuRows]);
  skuWs["!cols"] = [
    { wch: 8 }, { wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
    { wch: 14 }, { wch: 13 }, { wch: 9 }, { wch: 12 }, { wch: 8 },
    { wch: 5 }, { wch: 5 }, { wch: 6 },
  ];
  XLSX.utils.book_append_sheet(wb, skuWs, "SKU royxati");

  // ── 2. ABC×XYZ matritsa (9 katak) ──────────────────────────────────────────
  const matrix = buildMatrix(result);
  const matrixHeader = ["Sinf", "ABC", "XYZ", "SKU soni", "Savdo (so'm)", "Ulush %", "Strategiya"];
  const matrixRows: (string | number)[][] = [];
  for (const ac of ["A", "B", "C"] as const) {
    for (const xc of ["X", "Y", "Z"] as const) {
      const c = matrix[ac][xc];
      matrixRows.push([
        `${ac}${xc}`, ac, xc,
        c.count, Math.round(c.total), Number((c.share * 100).toFixed(2)),
        CELL_STRATEGY[ac][xc],
      ]);
    }
  }
  const matrixWs = XLSX.utils.aoa_to_sheet([matrixHeader, ...matrixRows]);
  matrixWs["!cols"] = [
    { wch: 6 }, { wch: 5 }, { wch: 5 }, { wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 52 },
  ];
  XLSX.utils.book_append_sheet(wb, matrixWs, "Matritsa");

  // ── 3. Xulosa (KPI + sinflar taqsimoti) ─────────────────────────────────────
  const classStat = (rows: typeof result.rows, key: "abc" | "xyz", cls: string) => {
    let n = 0, sum = 0;
    for (const r of rows) if (r[key] === cls) { n++; sum += r.total; }
    const share = result.totalAmount > 0 ? sum / result.totalAmount : 0;
    return { n, sum, share };
  };
  const summaryRows: (string | number)[][] = [
    ["Davr", `${startStr} — ${endStr}`],
    // branchId berilgan-u filial topilmasa "Barcha filiallar" deb aldamaslik kerak
    ["Filial", branchId ? (branch?.name ?? `Filial #${branchId} (topilmadi)`) : "Barcha filiallar"],
    ["Yuklash davrlari (XYZ asosi)", result.nPeriods],
    ["Tahlildagi SKU", result.rows.length],
    ["Jami savdo (so'm)", Math.round(result.totalAmount)],
    [],
    ["Sinf", "SKU soni", "Savdo (so'm)", "Ulush %"],
  ];
  for (const cls of ["A", "B", "C"] as const) {
    const s = classStat(result.rows, "abc", cls);
    summaryRows.push([`ABC — ${cls}`, s.n, Math.round(s.sum), Number((s.share * 100).toFixed(2))]);
  }
  for (const cls of ["X", "Y", "Z"] as const) {
    const s = classStat(result.rows, "xyz", cls);
    summaryRows.push([`XYZ — ${cls}`, s.n, Math.round(s.sum), Number((s.share * 100).toFixed(2))]);
  }
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Xulosa");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fn = `abc-xyz-${startStr}_${endStr}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fn}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Kutilmagan xatoda yalang'och 500 o'rniga log + tushunarli javob (L18).
export async function GET(...args: Parameters<typeof handleGET>) {
  try {
    return await handleGET(...args);
  } catch (err) {
    console.error("[api/abc-xyz/export]", err instanceof Error ? err.message : err);
    return new Response("Eksport tayyorlashda xato. Birozdan so'ng qayta urinib ko'ring.", { status: 500 });
  }
}
