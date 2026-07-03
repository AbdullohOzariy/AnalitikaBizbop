/**
 * Zakaz qabul kunlari — IKKI manba birgalikda:
 *  1. Aniq sanalar (SupplierOrderDay / AgentOrderDay) — bir martalik / istisno kunlar.
 *  2. Doimiy hafta kunlari (orderWeekdays Int[]) — har hafta takrorlanadigan qoida.
 *     0=Yakshanba ... 6=Shanba (JS getUTCDay va PostgreSQL EXTRACT(DOW) bilan bir xil).
 * Shu yordamchilar UI va server (Bugun, buyurtma oynasi) bo'ylab bir xil mantiq beradi.
 */

import { isoDay } from "@/lib/date";

const DAY = 86_400_000;
const toUTC = (s: string) => new Date(s + "T00:00:00.000Z");

export const WEEKDAY_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"]; // index = getUTCDay
export const WEEKDAY_FULL = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export function weekdayOf(dateStr: string): number {
  return toUTC(dateStr).getUTCDay();
}

/** Berilgan sana zakaz qabul kunimi — aniq sana YOKI doimiy hafta kuni. */
export function isOrderDay(dateStr: string, explicitDates: Set<string> | string[], weekdays: number[]): boolean {
  const set = explicitDates instanceof Set ? explicitDates : new Set(explicitDates);
  if (set.has(dateStr)) return true;
  return weekdays.includes(weekdayOf(dateStr));
}

/**
 * Bugundan (yoki bugundan keyin) eng yaqin zakaz qabul kuni (YYYY-MM-DD) — aniq sana
 * yoki doimiy hafta kuni. Hech biri bo'lmasa null.
 */
export function nextOrderDate(todayStr: string, explicitFutureDates: string[], weekdays: number[]): string | null {
  const fromExplicit = explicitFutureDates.filter((d) => d >= todayStr).sort()[0] ?? null;
  let fromWeekday: string | null = null;
  if (weekdays.length) {
    const todayDow = weekdayOf(todayStr);
    let minDelta = 8;
    for (const wd of weekdays) {
      const delta = (wd - todayDow + 7) % 7; // 0 = bugun
      if (delta < minDelta) minDelta = delta;
    }
    fromWeekday = isoDay(new Date(toUTC(todayStr).getTime() + minDelta * DAY));
  }
  if (fromExplicit && fromWeekday) return fromExplicit < fromWeekday ? fromExplicit : fromWeekday;
  return fromExplicit ?? fromWeekday;
}

/** Berilgan oy (year, month0 0-indeksli) ichidagi shu hafta kuniga to'g'ri keladigan barcha sanalar. */
export function weekdayDatesInMonth(year: number, month0: number, weekday: number): string[] {
  const out: string[] = [];
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    const date = new Date(Date.UTC(year, month0, d));
    if (date.getUTCDay() === weekday) out.push(isoDay(date));
  }
  return out;
}
