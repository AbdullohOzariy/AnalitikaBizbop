/**
 * Login urinishlarini cheklash — YAGONA manba.
 *
 * NEGA ALOHIDA MODUL: ilgari hisoblagich faqat `src/app/login/actions.ts` ichida
 * edi, ya'ni u FAQAT /login formasini himoyalardi. Ammo NextAuth o'z handler'ini
 * `/api/auth/*` da ochadi (src/auth-handler.ts) va
 *   POST /api/auth/callback/credentials
 * to'g'ridan-to'g'ri `authorize()` ni chaqiradi — server action'ni butunlay
 * chetlab o'tib. Ya'ni parol brute-force cheklanmagan edi.
 *
 * Endi hisoblash YAGONA choke point'da — `authorize()` da (src/auth.ts), chunki
 * ikkala yo'l ham o'sha yerdan o'tadi. Forma esa faqat "bloklanganmi?" deb
 * O'QIYDI (hisoblamaydi), shunda bitta urinish ikki marta sanalmaydi.
 *
 * Chegara ATAYLAB ikki o'lchovli: bitta IP'dan ko'p akkauntga urinish ham,
 * ko'p IP'dan bitta akkauntga urinish ham to'siladi.
 */

/**
 * Chegaralar ATAYLAB har xil.
 *
 * IP (5) — asosiy himoya: bitta manbadan parol tanlashni to'sadi.
 *
 * LOGIN (20) — faqat TAQSIMLANGAN hujumga (ko'p IP'dan bitta akkauntga) qarshi
 * zaxira. Nega IP bilan bir xil (5) EMAS: aks holda begona odam sizning
 * loginingizni bilsa, 5 ta soxta urinish yozib sizni 15 daqiqaga tizimga
 * kirita olmay qo'ya olardi — ya'ni himoyaning o'zi AKKAUNTNI QULFLASH
 * hujumiga aylanardi. 20 da bunday qulflash sezilarli darajada qiyinlashadi,
 * parol tanlash esa baribir IP chegarasida to'siladi.
 */
const MAX_IP = 5;
const MAX_LOGIN = 20;
const OYNA_MS = 15 * 60_000;

/** Login kalitlari soni chegarasi — `login` hujumchi boshqaradigan satr. */
const LOGIN_KALIT_MAX = 10_000;

type Chelak = { count: number; resetAt: number };

// Dev HMR'da ikkilanmasin (src/lib/prisma.ts naqshi).
const g = globalThis as typeof globalThis & {
  __loginIpBuckets?: Map<string, Chelak>;
  __loginNameBuckets?: Map<string, Chelak>;
};

/** IP bo'yicha — bu hisoblagich bitta manbadan kelayotgan hujumni to'sadi. */
const ipBuckets = (g.__loginIpBuckets ??= new Map<string, Chelak>());
/** Login bo'yicha — taqsimlangan (ko'p IP) hujumni to'sadi. */
const nameBuckets = (g.__loginNameBuckets ??= new Map<string, Chelak>());

const nameKey = (login: string) => login.trim().toLowerCase().slice(0, 120);

/** Bittalab urinishni hisoblaydi. `false` = chegara oshgan. */
function urin(m: Map<string, Chelak>, key: string, max: number, now: number): boolean {
  const b = m.get(key);
  if (!b || b.resetAt < now) {
    m.set(key, { count: 1, resetAt: now + OYNA_MS });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

function bloklangan(m: Map<string, Chelak>, key: string, max: number, now: number): boolean {
  const b = m.get(key);
  return !!b && b.resetAt >= now && b.count >= max;
}

/**
 * Xotira gigiyenasi. MUHIM: faqat LOGIN kalitlari majburan siqiladi —
 * `login` hujumchi boshqaradigan satr bo'lgani uchun cheksiz o'sishi mumkin.
 * IP chelaklari HECH QACHON majburan tozalanmaydi (faqat muddati o'tganlari):
 * aks holda hujumchi minglab soxta login yuborib, o'z IP blokini ham
 * yuvib tashlay olardi.
 */
function tozala(now: number) {
  for (const [k, b] of ipBuckets) if (b.resetAt < now) ipBuckets.delete(k);
  if (nameBuckets.size <= LOGIN_KALIT_MAX) return;
  for (const [k, b] of nameBuckets) if (b.resetAt < now) nameBuckets.delete(k);
  if (nameBuckets.size <= LOGIN_KALIT_MAX) return;
  // Hali ham ko'p — eng erta tugaydiganlaridan boshlab tashlaymiz.
  const tartib = [...nameBuckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (let i = 0; i < tartib.length - LOGIN_KALIT_MAX; i++) nameBuckets.delete(tartib[i][0]);
}

/**
 * Urinishni HISOBLAYDI. `false` = bloklandi (parolni tekshirmang).
 * Faqat `authorize()` chaqirsin — ikki marta sanalmasligi uchun.
 */
export function consumeLoginAttempt(ip: string, login: string): boolean {
  const now = Date.now();
  if (ipBuckets.size + nameBuckets.size > LOGIN_KALIT_MAX) tozala(now);
  // Ikkalasi ham hisoblansin (qisqa tutashuv bo'lmasin), keyin tekshiramiz.
  const ipOk = urin(ipBuckets, ip, MAX_IP, now);
  const nameOk = urin(nameBuckets, nameKey(login), MAX_LOGIN, now);
  return ipOk && nameOk;
}

/** Hisoblamasdan tekshiradi — foydalanuvchiga to'g'ri xabar ko'rsatish uchun. */
export function isLoginBlocked(ip: string, login: string): boolean {
  const now = Date.now();
  return (
    bloklangan(ipBuckets, ip, MAX_IP, now) ||
    bloklangan(nameBuckets, nameKey(login), MAX_LOGIN, now)
  );
}

/** Muvaffaqiyatli kirish — halol foydalanuvchi limitga tiqilib qolmasin. */
export function clearLoginAttempts(ip: string, login: string): void {
  ipBuckets.delete(ip);
  nameBuckets.delete(nameKey(login));
}
