// Davr navigatsiyasi (oldingi/keyingi davr o'qchalari) — barcha filtrlar uchun yagona mantiq.
// To'liq oy tanlangan bo'lsa — butun oyga siljiydi; aks holda davr uzunligiga teng siljiydi.

function parseISO(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Tanlangan oraliq aniq bir to'liq oymi (1-kun → oy oxiri). */
export function isFullMonthRange(startStr: string, endStr: string): boolean {
  const s = parseISO(startStr);
  const e = parseISO(endStr);
  if (!s || !e) return false;
  return (
    s.getUTCDate() === 1 &&
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    e.getUTCDate() === lastDayOfMonth(e.getUTCFullYear(), e.getUTCMonth())
  );
}

/** Davrni oldinga (dir=1) yoki orqaga (dir=-1) siljitadi. Yaroqsiz oraliqda null. */
export function shiftPeriod(
  startStr: string,
  endStr: string,
  dir: 1 | -1
): { start: string; end: string } | null {
  const s = parseISO(startStr);
  const e = parseISO(endStr);
  if (!s || !e || e < s) return null;

  // To'liq oy → butun oyga siljish
  if (isFullMonthRange(startStr, endStr)) {
    const ns = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + dir, 1));
    const ne = new Date(Date.UTC(ns.getUTCFullYear(), ns.getUTCMonth() + 1, 0));
    return { start: fmt(ns), end: fmt(ne) };
  }

  // Aks holda — davr uzunligiga teng siljish
  const dayMs = 86_400_000;
  const lenDays = Math.round((e.getTime() - s.getTime()) / dayMs) + 1;
  return {
    start: fmt(new Date(s.getTime() + dir * lenDays * dayMs)),
    end: fmt(new Date(e.getTime() + dir * lenDays * dayMs)),
  };
}
