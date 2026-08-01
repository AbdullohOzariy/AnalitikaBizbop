/**
 * SKU kesimi — Excel eksport. UI'dagi jadval bilan AYNI ma'lumot manbasi
 * (`supplierSkuBreakdown`), shuning uchun faylda va ekranda raqamlar bir xil.
 *
 * Eksport SERVER tomonda: `xlsx` klient bundeliga qo'shilsa sahifa og'irlashardi,
 * holbuki eksport kamdan-kam bosiladi.
 */
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { supplierSkuBreakdown } from "@/lib/partnership-sku";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canSeeAnalytics(session.user.roles)) {
    return new Response("Ruxsat yo'q", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const supplierId = Number(sp.get("supplierId"));
  const agentRaw = sp.get("agentId");
  const agentId = agentRaw && agentRaw !== "null" ? Number(agentRaw) : null;
  const periodStart = sp.get("start") ?? "";
  const periodEnd = sp.get("end") ?? "";

  if (!Number.isInteger(supplierId) || supplierId <= 0) return new Response("supplierId noto'g'ri", { status: 400 });
  if (!ISO.test(periodStart) || !ISO.test(periodEnd)) return new Response("Sana noto'g'ri", { status: 400 });
  if (agentId != null && !Number.isInteger(agentId)) return new Response("agentId noto'g'ri", { status: 400 });

  const [supplier, natija] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } }),
    supplierSkuBreakdown({ supplierId, agentId, periodStart, periodEnd, limit: 2000 }),
  ]);
  if (!supplier) return new Response("Ta'minotchi topilmadi", { status: 404 });

  // Oylik ustunlar dinamik — davr necha oyni qamrasa shuncha ustun
  const rows = natija.rows.map((r) => {
    const asos: Record<string, string | number | null> = {
      "Kod": r.code,
      "Nomi": r.name,
      "Brend": r.brandName ?? "",
      "Savdo (davr)": Math.round(r.savdo),
      "Ulush %": +r.ulushPct.toFixed(2),
      "Marja %": r.marjaPct != null ? +r.marjaPct.toFixed(2) : null,
    };
    for (const o of r.oylar) asos[o.oy] = Math.round(o.savdo);
    asos["O'tgan oy"] = r.otganOySavdo != null ? Math.round(r.otganOySavdo) : null;
    asos["O'tgan oyga %"] = r.momPct != null ? +r.momPct.toFixed(1) : null;
    asos["O'tgan yil (ayni oy)"] = r.otganYilSavdo != null ? Math.round(r.otganYilSavdo) : null;
    asos["O'tgan yilga %"] = r.yoyPct != null ? +r.yoyPct.toFixed(1) : null;
    return asos;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  // Sarlavha ostiga izoh qo'ymaymiz — fayl mashina o'qishi uchun ham ishlatiladi;
  // kontekst fayl NOMIDA (ta'minotchi + davr).
  XLSX.utils.book_append_sheet(wb, ws, "SKU");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const nom = `${supplier.name}_${periodStart}_${periodEnd}`.replace(/[^\p{L}\p{N}_.-]+/gu, "-").slice(0, 90);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`SKU_${nom}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
