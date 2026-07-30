/**
 * HAFTA ARIFMETIKASI — prognoz oynalarini "YYYY-MM-DD" (dushanba) sifatida hisoblaydi.
 *
 * NEGA MATN, Date EMAS: hafta indeksi (`i`) barqaror kalit EMAS — eski davr importi
 * kelsa hamma indeks bir pozitsiyaga siljiydi va saqlangan prognoz boshqa haftaga
 * tegishli bo'lib qoladi. Sana esa o'zgarmas. Toshkentda DST yo'q, shuning uchun
 * "+7 kun" arifmetikasi UTC'da aniq.
 */
import { isoDay, parseDateParam } from "@/lib/date";

const KUN_MS = 86_400_000;
const HAFTA_MS = 7 * KUN_MS;

function toDate(iso: string): Date {
  const d = parseDateParam(iso);
  if (!d) throw new Error(`hafta: noto'g'ri sana "${iso}"`);
  return d;
}

/**
 * ISO kunni o'z haftasining DUSHANBAsiga keltiradi. Postgres `date_trunc('week', …)`
 * bilan bir xil ta'rif (ISO-8601: hafta dushanbadan boshlanadi).
 */
export function haftaBoshi(iso: string): string {
  const d = toDate(iso);
  const siljish = (d.getUTCDay() + 6) % 7; // dushanbadan o'tgan kunlar (yakshanba → 6)
  return isoDay(new Date(d.getTime() - siljish * KUN_MS));
}

/** Haftaga `n` hafta qo'shadi (manfiy — ayiradi). */
export function haftaQosh(iso: string, n: number): string {
  return isoDay(new Date(toDate(iso).getTime() + n * HAFTA_MS));
}

/** `b − a`, butun haftada (a keyin bo'lsa manfiy). */
export function haftaFarq(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / HAFTA_MS);
}

/**
 * Kutilgan origin: BUGUNGI kunda tugagan oxirgi TO'LIQ hafta (ya'ni o'tgan hafta
 * dushanbasi). Joriy hafta hech qachon origin bo'lmaydi — u chala.
 */
export function kutilganOrigin(now: Date): string {
  return haftaQosh(haftaBoshi(isoDay(now)), -1);
}

/** `@db.Date` ustuniga yozish uchun UTC yarim tun. */
export function haftaDate(iso: string): Date {
  return toDate(iso);
}
