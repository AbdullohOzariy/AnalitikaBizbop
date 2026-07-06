import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import {
  chiqimDefaultRange,
  chiqimSummary,
  chiqimByBranch,
  chiqimByKategoriya,
  chiqimExportRows,
  type ChiqimRange,
} from "@/lib/spisaniya/db";
import { TUR_LABEL } from "@/lib/spisaniya/labels";
import { isoDay, parseDateParam } from "@/lib/date";

async function handleGET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const roles = session.user.roles;
  if (!canSeeAnalytics(roles)) {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const def = chiqimDefaultRange();

  const range: ChiqimRange = {
    start: parseDateParam(sp.get("start"), def.start)!,
    end: parseDateParam(sp.get("end"), def.end)!,
  };
  const tur    = sp.get("tur")    ?? undefined;
  const filial = sp.get("filial") ?? undefined;

  const [summary, byBranch, byKategoriya, rows] = await Promise.all([
    chiqimSummary(range, filial, tur),
    chiqimByBranch(range, filial, tur),
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
  const katTotal = byKategoriya.reduce((a, r) => a + r.summa, 0);
  const kategoriyaHeader = ["Kategoriya", "Soni", "Summa", "Ulush %"];
  const kategoriyaRows = [...byKategoriya]
    .sort((a, b) => b.summa - a.summa)
    .map((r) => [r.kategoriya, r.count, r.summa, katTotal > 0 ? Number(((r.summa / katTotal) * 100).toFixed(1)) : 0]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([kategoriyaHeader, ...kategoriyaRows]),
    "Kategoriya boyicha"
  );

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const startStr = isoDay(range.start);
  const endStr   = isoDay(range.end);
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

// Kutilmagan xatoda yalang'och 500 o'rniga log + tushunarli javob (L18).
export async function GET(...args: Parameters<typeof handleGET>) {
  try {
    return await handleGET(...args);
  } catch (err) {
    console.error("[api/chiqim/export]", err instanceof Error ? err.message : err);
    return new Response("Eksport tayyorlashda xato. Birozdan so'ng qayta urinib ko'ring.", { status: 500 });
  }
}
