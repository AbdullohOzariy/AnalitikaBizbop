import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { scopeSubIds } from "@/lib/scope";
import { getQoldiqReport, type QoldiqSort } from "@/lib/qoldiq";
import { formatDateTimeUZ } from "@/lib/format";
import { todayTashkentISO } from "@/lib/date";

// Qoldiq 25k SKU'ga yetishi mumkin — eksport uchun xavfsiz yuqori limit (pagination YO'Q).
const MAX_ROWS = 50_000;

async function handleGET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!canSeeAnalytics(session.user.roles)) return new Response("Forbidden", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const dayParam = sp.get("day") ?? "";
  const dayStr = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayTashkentISO();
  const branchId = sp.get("branchId") ? parseInt(sp.get("branchId")!) : undefined;
  const categoryId = sp.get("categoryId") ? parseInt(sp.get("categoryId")!) : undefined;
  const q = sp.get("q")?.trim() ?? "";
  const sortParam = sp.get("sort");
  const sort: QoldiqSort =
    sortParam === "code" || sortParam === "name" ? sortParam : "qty";

  // Kategoriya menejeri qamrovi — sahifadagi kabi (o'z kategoriyalaridan tashqarisini eksport qilmasin).
  const scope = await scopeSubIds(Number(session.user.id), session.user.roles);

  const [report, branch] = await Promise.all([
    getQoldiqReport({
      dayStr,
      branchId,
      categoryId,
      q,
      page: 1,
      pageSize: MAX_ROWS,
      scopeSubIds: scope,
      sort,
    }),
    branchId
      ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const branchCol = branch?.name ?? "Filial qoldiq";
  const header = [
    "Kod", "Nom", "Guruh", "Kategoriya", "Subkategoriya",
    branchCol, "Markaziy sklad", "Qoldiq sanasi", "Import vaqti",
  ];
  const data = report.rows.map((r) => [
    r.code,
    r.name,
    r.groupName ?? "Moslanmagan",
    r.catName ?? "Moslanmagan",
    r.subName ?? "Moslanmagan",
    r.branchQty,
    r.warehouseQty ?? "",
    r.day,
    r.asOf ? formatDateTimeUZ(r.asOf) : "",
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"] = [
    { wch: 8 }, { wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Qoldiq");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fn = `qoldiq-${dayStr}.xlsx`;
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
    console.error("[api/baza/qoldiq/export]", err instanceof Error ? err.message : err);
    return new Response("Eksport tayyorlashda xato. Birozdan so'ng qayta urinib ko'ring.", { status: 500 });
  }
}
