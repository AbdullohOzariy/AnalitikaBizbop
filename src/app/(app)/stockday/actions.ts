"use server";

/** Stockday daraxti uchun lazy SKU barglari — subkat ochilganda yuklanadi. */
import { z } from "zod";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { scopeSubIds } from "@/lib/scope";
import { stockdayRows, type StockdayRow, type StockView } from "@/lib/snapshot-reports";

const schema = z.object({
  startStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.coerce.number().int().positive().optional(),
  q: z.string().max(100).default(""),
  view: z.enum(["kritik", "kam", "normal", "ortiqcha"]),
  subId: z.coerce.number().int(), // -1 — Moslanmagan
  todayStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const LEAF_LIMIT = 500;

export async function stockdayLeavesAction(
  input: z.input<typeof schema>
): Promise<{ ok: true; rows: StockdayRow[]; truncated: boolean } | { ok: false; error: string }> {
  try {
    const session = await auth();
    if (!session?.user || !canSeeAnalytics(session.user.role)) throw new Error("Ruxsat yo'q");
    const p = schema.parse(input);
    const scope = await scopeSubIds(Number(session.user.id), session.user.role!);
    if (scope && p.subId !== -1 && !scope.includes(p.subId)) {
      return { ok: false, error: "Qamrovingizdan tashqari kategoriya." };
    }
    const rows = await stockdayRows(
      {
        startStr: p.startStr,
        endStr: p.endStr,
        branchId: p.branchId,
        categoryId: p.subId === -1 ? undefined : p.subId,
        q: p.q,
        scopeSubIds: scope,
      },
      p.view as StockView,
      1,
      LEAF_LIMIT,
      p.todayStr
    );
    const filtered = p.subId === -1 ? rows.filter((r) => r.cname == null) : rows;
    return { ok: true, rows: filtered, truncated: rows.length >= LEAF_LIMIT };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}
