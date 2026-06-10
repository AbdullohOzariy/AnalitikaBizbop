"use server";

/** OOS daraxti uchun lazy SKU barglari — subkat ochilganda yuklanadi. */
import { z } from "zod";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { scopeSubIds } from "@/lib/scope";
import { oosRows, type OosRow, type OosView } from "@/lib/snapshot-reports";

const schema = z.object({
  startStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.coerce.number().int().positive().optional(),
  q: z.string().max(100).default(""),
  view: z.enum(["oos", "low", "dead"]),
  subId: z.coerce.number().int(), // -1 — Moslanmagan
});

const LEAF_LIMIT = 500;

export async function oosLeavesAction(
  input: z.input<typeof schema>
): Promise<{ ok: true; rows: OosRow[]; truncated: boolean } | { ok: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user || !canSeeAnalytics(session.user.role)) throw new Error("Ruxsat yo'q");
    const p = schema.parse(input);
    // Qamrov serverda qayta hisoblanadi (klientga ishonmaymiz)
    const scope = await scopeSubIds(Number(session.user.id), session.user.role!);
    if (scope && p.subId !== -1 && !scope.includes(p.subId)) {
      return { ok: false, error: "Qamrovingizdan tashqari kategoriya." };
    }
    const rows = await oosRows(
      {
        startStr: p.startStr,
        endStr: p.endStr,
        branchId: p.branchId,
        // -1 (Moslanmagan) — categoryId filtri yo'q; aks holda subkat bo'yicha
        categoryId: p.subId === -1 ? undefined : p.subId,
        q: p.q,
        scopeSubIds: scope,
      },
      p.view as OosView,
      1,
      LEAF_LIMIT
    );
    // Moslanmagan tugun uchun kategoriyasizlarni ajratamiz
    const filtered = p.subId === -1 ? rows.filter((r) => r.cname == null) : rows;
    return { ok: true, rows: filtered, truncated: rows.length >= LEAF_LIMIT };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}
