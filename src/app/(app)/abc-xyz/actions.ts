"use server";

/**
 * ABC/XYZ daraxti uchun lazy SKU yuklash va qidiruv.
 * To'liq SKU ro'yxati (minglab qator) sahifa payload'iga kirmaydi — subkat
 * ochilganda yoki qidiruvda keshlangan natijadan (computeAbcXyz) filtrlanadi.
 */
import { z } from "zod";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { computeAbcXyz, type SkuAnaliz } from "@/lib/abc-xyz";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireAnalytics() {
  const session = await auth();
  if (!session?.user || !canSeeAnalytics(session.user.roles)) throw new Error("Ruxsat yo'q");
}

const ctxSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.coerce.number().int().positive().optional(),
  // Matritsa katagi drill-down'i: berilsa faqat shu sinf SKU'lari qaytadi
  abc: z.enum(["A", "B", "C"]).optional(),
  xyz: z.enum(["X", "Y", "Z"]).optional(),
});

function cellFilter(rows: SkuAnaliz[], p: { abc?: string; xyz?: string }): SkuAnaliz[] {
  if (!p.abc && !p.xyz) return rows;
  return rows.filter((r) => (!p.abc || r.abc === p.abc) && (!p.xyz || r.xyz === p.xyz));
}

const subSchema = ctxSchema.extend({
  // -1 — "Moslanmagan" (kategoriyasiz) tugun
  catId: z.coerce.number().int(),
  subId: z.coerce.number().int(),
});

/** Bitta subkategoriya SKU'lari (savdo bo'yicha kamayish tartibida). */
export async function loadSubSkusAction(
  input: z.input<typeof subSchema>
): Promise<Result<SkuAnaliz[]>> {
  try {
    await requireAnalytics();
    const p = subSchema.parse(input);
    const { rows } = await computeAbcXyz(p.start, p.end, p.branchId);
    const data = cellFilter(rows, p).filter(
      (r) => (r.subId ?? -1) === p.subId && (r.catId ?? -1) === p.catId
    );
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}

const searchSchema = ctxSchema.extend({
  q: z.string().trim().min(2).max(100),
});

const SEARCH_LIMIT = 200;

/** SKU qidiruv (nom yoki kod) — eng katta savdolilar birinchi, 200 tagacha. */
export async function searchSkusAbcAction(
  input: z.input<typeof searchSchema>
): Promise<Result<{ hits: SkuAnaliz[]; truncated: boolean }>> {
  try {
    await requireAnalytics();
    const p = searchSchema.parse(input);
    const { rows } = await computeAbcXyz(p.start, p.end, p.branchId);
    const q = p.q.toLowerCase();
    const all = cellFilter(rows, p).filter(
      (r) => r.name.toLowerCase().includes(q) || String(r.code).includes(q)
    );
    return {
      ok: true,
      data: { hits: all.slice(0, SEARCH_LIMIT), truncated: all.length > SEARCH_LIMIT },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Noma'lum xato" };
  }
}
