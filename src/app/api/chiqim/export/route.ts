import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import {
  chiqimDefaultRange,
  chiqimSummary,
  chiqimByBranch,
  chiqimByKategoriya,
  chiqimExportRows,
  type ChiqimRange,
} from "@/lib/spisaniya/db";
import { TUR_LABEL } from "@/lib/spisaniya/labels";

function parseDate(s: string | null, fallback: Date): Date {
  if (!s) return fallback;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "CEO") {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const def = chiqimDefaultRange();

  const range: ChiqimRange = {
    start: parseDate(sp.get("start"), def.start),
    end: parseDate(sp.get("end"), def.end),
  };
  const tur    = sp.get("tur")    ?? undefined;
  const filial = sp.get("filial") ?? undefined;

  const [summary, byBranch, byKategoriya, rows] = await Promise.all([
    chiqimSummary(range, filial),
    chiqimByBranch(range, filial),
    chiqimByKategoriya(range, filial),
    chiqimExportRows(range, { tur, filial }),
  ]);

  const wb = XLSX.utils.book_new();

  // ── 1. Yozuvlar varag'i ────────────────────────────────────────────────────
  const yozuvlarHeader = [
    "Vaqt", "Tur", "Tovar", "Miqdor", "Birlik", "Summa",
    "Filial", "Kategoriya", "Sabab", "Xodim",
  ];
  const yozuvlarRows = rows.map((r) => [
    r.vaqt ? r.vaqt.slice(0, 16).replace("T", " ") : "",
    TUR_LABEL[r.tur] ?? r.tur,
    r.tovar,
    r.miqdor,
    r.birlik,
    r.summa,
    r.filial,
    r.kategoriya ?? "",
    r.sabab ?? "",
    r.xodim_ism,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([yozuvlarHeader, ...yozuvlarRows]),
    "Yozuvlar"
  );

  // ── 2. Tur bo'yicha varag'i ────────────────────────────────────────────────
  const turHeader = ["Tur", "Soni", "Summa"];
  const turRows = summary.map((r) => [TUR_LABEL[r.tur] ?? r.tur, r.count, r.summa]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([turHeader, ...turRows]),
    "Tur boyicha"
  );

  // ── 3. Filial bo'yicha varag'i ─────────────────────────────────────────────
  const filialHeader = ["Filial", "Soni", "Summa"];
  const filialRows = byBranch.map((r) => [r.filial, r.count, r.summa]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([filialHeader, ...filialRows]),
    "Filial boyicha"
  );

  // ── 4. Kategoriya bo'yicha varag'i ─────────────────────────────────────────
  const kategoriyaHeader = ["Kategoriya", "Soni", "Summa"];
  const kategoriyaRows = byKategoriya.map((r) => [r.kategoriya, r.count, r.summa]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([kategoriyaHeader, ...kategoriyaRows]),
    "Kategoriya boyicha"
  );

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const startStr = range.start.toISOString().slice(0, 10);
  const endStr   = range.end.toISOString().slice(0, 10);
  const filename = `chiqim-${startStr}_${endStr}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
