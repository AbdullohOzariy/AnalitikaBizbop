/**
 * Kirishlar jurnali — YOZISH qatlami (Tizim → Kirishlar).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ TEMIR QOIDA: bu modul KRITIK YO'LDA (login, bot API) chaqiriladi.        ║
 * ║  • hech qachon `await` qilinmaydi — barcha funksiya `void` qaytaradi;    ║
 * ║  • hech qachon throw QILMAYDI — har bir xato yutiladi + console.error;   ║
 * ║  • DB yiqilsa kirish BARIBIR ishlaydi (jurnal shunchaki yozilmaydi).     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Sessiya modeli (nega hodisa ≠ har so'rov):
 *   Miniapp har tugma bosilganda API chaqiradi. Har chaqiruvni "kirish" deb
 *   yozsak kuniga o'n minglab qator bo'lardi. Shuning uchun aktor uchun bitta
 *   AccessSession qatori ochiladi va 30 daqiqa jimlikkacha shu qator
 *   uzaytiriladi. ISSIQ YO'L DB'ga UMUMAN TEGMAYDI — faqat xotiradagi Map
 *   yangilanadi; fon flusher 60 soniyada bir marta "iflos" qatorlarni yozadi.
 *
 * Yozuv byudjeti: 50 aktor × kuniga 8 soat uzluksiz ishlasa ham
 *   ~50 create + ~50×480 emas, balki flusher tufayli ~50×480/1 = 24k update/kun
 *   (amalda seanslar 2-5 daqiqa → kuniga bir necha yuz yozuv).
 */
import { prisma } from "@/lib/prisma";
import { todayTashkentISO } from "@/lib/date";
import { redactForLog } from "@/lib/tg-redact";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import type { AccessSurface, AccessEventType } from "@/generated/prisma/enums";

// ─── Sozlamalar ──────────────────────────────────────────────────────────────

/** Jimlik oynasi: shundan uzoq sukutdan keyingi so'rov YANGI sessiya ochadi. */
const IDLE_MS = Math.max(1, Number(process.env.ACCESS_SESSION_IDLE_MIN) || 30) * 60_000;

/** Fon flusher davri — sessiya davomiyligining aniqligi shu qadar (60s). */
const FLUSH_MS = 60_000;

/** Xotira gigiyenasi: bir vaqtda kuzatiladigan aktorlar chegarasi. */
const MEM_MAX = 5_000;

/**
 * QAT'IY SHIFT: muvaffaqiyatsiz hodisalar (LOGIN_FAIL/DENIED/BLOCKED) uchun
 * daqiqasiga yoziladigan qatorlarning GLOBAL chegarasi.
 *
 * Nega kerak: per-kalit throttle kalit KARDINALLIGI cheklangan bo'lsagina
 * himoya qiladi. Login satri yoki IP kabi hujumchi boshqaradigan qiymat kalitga
 * kirsa, u har safar yangi kalit yasab throttle'ni aylanib o'tadi. Bu shift esa
 * kalitdan QAT'I NAZAR ishlaydi — jurnal hech qachon DB pool'ini yeb, kirishning
 * o'zini yiqita olmaydi.
 */
const FAIL_BUDGET_PER_MIN = 60;

// ─── Modul holati (dev HMR'da ikkilanmasin — prisma.ts:15 naqshi) ────────────

type Mem = {
  id: number; // AccessSession.id
  lastSeen: number; // oxirgi faollik (epoch ms) — xotirada
  lastWrite: number; // DB'ga oxirgi yozilgan lastSeen
  buffered: number; // hali yozilmagan `hits` o'sishi
};

const g = globalThis as typeof globalThis & {
  __accessMem?: Map<string, Mem>;
  __accessPending?: Set<string>;
  __accessEventSeen?: Map<string, number>;
  __accessFlusher?: NodeJS.Timeout;
  __accessFlushing?: boolean;
};

const mem = (g.__accessMem ??= new Map<string, Mem>());
/** Sovuq yo'l bir kalit uchun bir vaqtda BIR MARTA ishlasin (thundering herd). */
const pending = (g.__accessPending ??= new Set<string>());
/** Hodisa throttle'i: kalit → MUDDATI TUGASH payti (insertion emas — aralash
 *  oynalarda to'g'ri tozalash uchun). */
const eventSeen = (g.__accessEventSeen ??= new Map<string, number>());

// ─── Yordamchilar ────────────────────────────────────────────────────────────

/** Ustun uzunligiga kesish — `22001 value too long` xatosi yozuvni yo'qotmasin. */
function cut(s: string | null | undefined, n: number): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t.slice(0, n) : null;
}

/** Xatoni yutadi — jurnal hech qachon chaqiruvchini yiqitmaydi. */
function swallow(joy: string) {
  return (e: unknown) => {
    console.error(`[access-log:${joy}]`, redactForLog(e));
  };
}

export type ActorInfo = {
  surface: AccessSurface;
  userId?: number | null;
  tgUserId?: number | bigint | null;
  actorName?: string | null;
  route?: string | null;
};

/**
 * Aktor kaliti. Platforma foydalanuvchisi bo'lsa "u:<id>", aks holda "tg:<id>".
 * Ikkalasi ham yo'q bo'lsa `null` — bunday yozuv umuman yaratilmaydi
 * (aks holda "tg:undefined" degan axlat qator paydo bo'lardi).
 */
function actorKey(a: ActorInfo): string | null {
  if (a.userId != null) return `u:${a.userId}`;
  if (a.tgUserId != null) return `tg:${a.tgUserId}`;
  return null;
}

function memKey(surface: AccessSurface, key: string): string {
  return `${surface}|${key}`;
}

function toBigInt(v: number | bigint | null | undefined): bigint | null {
  if (v == null) return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

// ─── Hodisa yozuvi ───────────────────────────────────────────────────────────

/**
 * Bitta AccessEvent yozadi. FIRE-AND-FORGET.
 *
 * Ikki bosqichli himoya (jurnal DB pool'ini yeb, kirishning O'ZINI yiqitmasin):
 *
 *  1. `throttle` — per-kalit oyna. Autentifikatsiyadan OLDINGI yo'llarda
 *     (BAD_SIGNATURE) va takrorlanuvchi rad etishlarda (DENIED) SHART.
 *     MUHIM: kalitga hujumchi boshqaradigan qiymat (login satri kabi)
 *     QO'SHILMASIN — u har urinishda yangi kalit yasab throttle'ni aylanib o'tadi.
 *
 *  2. `FAIL_BUDGET_PER_MIN` — global shift. Kalit kardinalligidan qat'i nazar
 *     ishlaydi. Bu ZARUR, chunki web login'ining rate-limit'i faqat /login
 *     formasida (src/app/login/actions.ts); `POST /api/auth/callback/credentials`
 *     esa uni butunlay chetlab o'tadi va authorize() ni cheklovsiz chaqira oladi.
 */
export function logAccessEvent(e: {
  surface: AccessSurface;
  type: AccessEventType;
  userId?: number | null;
  tgUserId?: number | bigint | null;
  actorName?: string | null;
  login?: string | null;
  reason?: string | null;
  route?: string | null;
  throttle?: { key: string; ms: number };
}): void {
  try {
    const now = Date.now();

    // 1) Per-kalit throttle (berilgan bo'lsa).
    if (e.throttle) {
      const k = `${e.type}|${e.surface}|${e.throttle.key}`;
      const muddat = eventSeen.get(k);
      if (muddat != null && muddat > now) return; // hali kuchda — jim tashlab yuboriladi
      eventSeen.set(k, now + e.throttle.ms);
      if (eventSeen.size > MEM_MAX) {
        for (const [key, t] of eventSeen) if (t <= now) eventSeen.delete(key);
        // Hammasi hali kuchda bo'lsa ham xotira o'smasin — qattiq tozalash.
        // (Throttle vaqtincha "unutiladi", lekin quyidagi global shift baribir to'sadi.)
        if (eventSeen.size > MEM_MAX) eventSeen.clear();
      }
    }

    // 2) GLOBAL shift — kalit kardinalligidan qat'i nazar ishlaydigan yakuniy to'siq.
    //    Muvaffaqiyatli kirish (LOGIN_OK) bundan mustasno: u kam va har biri qimmatli.
    if (e.type !== "LOGIN_OK" && !rateLimit("access-log:fail", FAIL_BUDGET_PER_MIN, 60_000)) {
      return;
    }

    void prisma.accessEvent
      .create({
        data: {
          surface: e.surface,
          type: e.type,
          dayKey: todayTashkentISO(),
          userId: e.userId ?? null,
          tgUserId: toBigInt(e.tgUserId),
          actorName: cut(e.actorName, 120),
          login: cut(e.login, 120),
          reason: cut(e.reason, 40),
          route: cut(e.route, 120),
        },
        select: { id: true },
      })
      .catch(swallow("event"));
  } catch (err) {
    swallow("event-sync")(err);
  }
}

// ─── Sessiya (faollik oynasi) ────────────────────────────────────────────────

/**
 * Faollikni belgilaydi: sessiyani ochadi yoki mavjudini uzaytiradi.
 *
 * `openEvent` berilsa — YANGI sessiya ochilgandagina (uzaytirishda EMAS)
 * qo'shimcha AccessEvent yoziladi. Platformada (WEB) berilmaydi: u yerda
 * kirish hodisasi login momentida `authorize()` da yoziladi.
 */
export function touchAccess(a: ActorInfo & { openEvent?: AccessEventType }): void {
  try {
    const key = actorKey(a);
    if (!key) return;
    const now = Date.now();
    const k = memKey(a.surface, key);

    const m = mem.get(k);
    // ── ISSIQ YO'L: 99% chaqiruv shu yerda tugaydi, DB'ga TEGILMAYDI ──
    if (m && now - m.lastSeen < IDLE_MS) {
      m.lastSeen = now;
      m.buffered++;
      return;
    }

    // ── SOVUQ YO'L: yangi sessiya yoki jarayon restartidan keyingi birinchi so'rov ──
    startFlusher();
    if (pending.has(k)) return; // bir vaqtda kelgan so'rovlar ikkinchi qator ochmasin
    pending.add(k);

    void (async () => {
      // Restartda xotira bo'shaydi. DB'da hali TIRIK sessiya bo'lsa uni davom
      // ettiramiz — aks holda har deploy soxta "yangi kirish" yasardi.
      const open = await prisma.accessSession.findFirst({
        where: {
          actorKey: key,
          surface: a.surface,
          lastSeenAt: { gte: new Date(now - IDLE_MS) },
        },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true },
      });

      if (open) {
        await prisma.accessSession.update({
          where: { id: open.id },
          data: { lastSeenAt: new Date(now), hits: { increment: 1 } },
        });
        // BOSIB YOZMAYMIZ: shu so'rov DB'da yurgan paytda foydalanuvchi login
        // qilgan bo'lishi mumkin (startAccessSession yangi sessiya ochib mem'ga
        // yozadi). Kech qaytgan bu natija uni almashtirsa, login sessiyasi
        // hech qachon yangilanmay davomiyligi 0 bo'lib qolardi.
        if (!mem.has(k)) mem.set(k, { id: open.id, lastSeen: now, lastWrite: now, buffered: 0 });
        return; // bu davomi — kirish hodisasi YOZILMAYDI
      }

      await createSession(a, key, k, now, false);
    })()
      .catch(swallow("session"))
      .finally(() => pending.delete(k));
  } catch (err) {
    swallow("touch-sync")(err);
  }
}

/**
 * Login momentida MAJBURAN yangi sessiya ochadi (mavjudini uzaytirmaydi).
 * `touchAccess` ni qayta ishlatib bo'lmaydi: u tirik sessiyani topib uzaytirardi
 * va 30 daqiqa ichida qayta kirgan xodim jurnalda ko'rinmay qolardi.
 */
export function startAccessSession(a: ActorInfo): void {
  try {
    const key = actorKey(a);
    if (!key) return;
    const now = Date.now();
    const k = memKey(a.surface, key);
    startFlusher();
    // `pending` ga qo'shamiz — shu payt boshlangan sovuq yo'l bizning
    // sessiyamizni yaratilgandan keyin bosib yozmasin (touchAccess'dagi
    // `!mem.has(k)` sharti bilan birga ishlaydi).
    pending.add(k);
    mem.delete(k);
    void createSession(a, key, k, now, true)
      .catch(swallow("session-start"))
      .finally(() => pending.delete(k));
  } catch (err) {
    swallow("start-sync")(err);
  }
}

/**
 * Yangi AccessSession qatori + (so'ralgan bo'lsa) ochilish hodisasi.
 * `majburiy` — login yo'li: xotiradagi ko'rsatkichni shartsiz almashtiradi.
 * Faollik yo'lida esa oraliqda paydo bo'lgan yangi sessiya bosib yozilmaydi.
 */
async function createSession(
  a: ActorInfo & { openEvent?: AccessEventType },
  key: string,
  k: string,
  now: number,
  majburiy: boolean
): Promise<void> {
  const s = await prisma.accessSession.create({
    data: {
      surface: a.surface,
      actorKey: key.slice(0, 40),
      dayKey: todayTashkentISO(),
      userId: a.userId ?? null,
      tgUserId: toBigInt(a.tgUserId),
      actorName: cut(a.actorName, 120),
      hits: 1,
    },
    select: { id: true },
  });
  if (majburiy || !mem.has(k)) {
    mem.set(k, { id: s.id, lastSeen: now, lastWrite: now, buffered: 0 });
  }
  gcMem();
  if (a.openEvent) {
    logAccessEvent({
      surface: a.surface,
      type: a.openEvent,
      userId: a.userId,
      tgUserId: a.tgUserId,
      actorName: a.actorName,
      route: a.route,
    });
  }
}

/** Xotira o'smasin — eskirgan (jimlik oynasidan chiqqan) yozuvlarni tashlaymiz. */
function gcMem() {
  if (mem.size <= MEM_MAX) return;
  const now = Date.now();
  for (const [k, m] of mem) if (now - m.lastSeen > IDLE_MS) mem.delete(k);
}

// ─── Fon flusher ─────────────────────────────────────────────────────────────

/**
 * Issiq yo'l DB'ga yozmaydi, shu sababli `lastSeenAt` ni kimdir yangilashi kerak —
 * aks holda tipik (2-5 daqiqalik) seansda `lastSeenAt === startedAt` bo'lib
 * qolardi va SESSIYA DAVOMIYLIGI DOIM 0 chiqardi.
 *
 * Har 60 soniyada "iflos" (xotirada yangilangan, DB'da eskirgan) qatorlarni
 * yozamiz. `unref()` — bu taymer Node jarayonini ushlab turmaydi (build/CLI
 * kontekstida osilib qolmaydi).
 */
function startFlusher() {
  if (g.__accessFlusher) return;
  const t = setInterval(() => {
    void flushDirty();
  }, FLUSH_MS);
  t.unref?.();
  g.__accessFlusher = t;
}

async function flushDirty(): Promise<void> {
  // Qayta-kirish gvardiyasi: yozuv 60 soniyadan cho'zilsa ikkita tsikl ustma-ust
  // tushib, bitta sessiyaning `hits` ini ikki marta oshirib yuborardi.
  if (g.__accessFlushing) return;
  g.__accessFlushing = true;
  try {
    const now = Date.now();
    for (const [k, m] of mem) {
      if (m.lastSeen <= m.lastWrite) {
        // Faollik yo'q — jimlik oynasidan chiqqan bo'lsa xotiradan tushiramiz.
        if (now - m.lastSeen > IDLE_MS) mem.delete(k);
        continue;
      }
      const seen = m.lastSeen;
      const hits = m.buffered;
      m.lastWrite = seen;
      m.buffered = 0;
      try {
        await prisma.accessSession.update({
          where: { id: m.id },
          data: { lastSeenAt: new Date(seen), ...(hits > 0 ? { hits: { increment: hits } } : {}) },
        });
      } catch (e) {
        // Qator YO'Q (P2025) — masalan retention cron o'chirgan. Bunda qayta
        // urinishning ma'nosi yo'q: yozuvni xotiradan tushiramiz. Ilgari bu holat
        // yozuvni abadiy "iflos" qoldirib, HAR tsiklda shu yerda to'xtatgani uchun
        // qolgan BARCHA sessiyalarning yangilanishini bloklardi.
        if ((e as { code?: string })?.code === "P2025") {
          mem.delete(k);
          continue;
        }
        // Ulanish xatosi — hisoblagich yo'qolmasin, keyingi davrda qayta urinamiz.
        m.lastWrite = 0;
        m.buffered += hits;
        swallow("flush")(e);
        return; // DB yiqilgan — qolganini urinib o'tirmaymiz
      }
    }
  } finally {
    g.__accessFlushing = false;
  }
}
