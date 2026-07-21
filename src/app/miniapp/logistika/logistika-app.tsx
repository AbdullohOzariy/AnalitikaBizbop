"use client";

/**
 * Haydovchi Mini App — REJA YO'Q, faqat FAKT. Bitta sahifa, 3 holat:
 *   A "bosh"    — moshina + yo'nalish tanlab yo'lga chiqish (2 bosish);
 *   B "yo'lda"  — bitta katta "Yetib bordim" tugmasi;
 *   C "kelindi" — hub bo'lmagan nuqtaga yetib kelgach: keyingi plecho yoki yakun.
 * Yuk chipining O'ZI jo'natish tugmasi — alohida "Jo'natish" yo'q (bosish soni muhim).
 *
 * Idempotentlik: clientEventId NIYAT paydo bo'lganda bir marta yaratiladi va
 * localStorage'da SERVER JAVOBI KELGUNCHA yashaydi. Javob kelsa (200 ham, 409 ham)
 * o'chiriladi — natija noma'lum bo'lgan holatdagina (tarmoq uzildi) saqlanib qoladi,
 * shunda qayta bosish reysni ikkilantirmaydi (server replay qaytaradi).
 *
 * GPS ixtiyoriy: LocationManager (Bot API 8.0) 3 soniya ichida javob bermasa yoki
 * rad etilsa lat/lng yuborilmaydi va so'rov BARIBIR ketadi — haydovchi to'siqqa uchramaydi.
 *
 * Window.Telegram global tipi sverka-app.tsx da e'lon qilingan (declare global);
 * LocationManager u yerda yo'q — quyida TgExt cast'i bilan olinadi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TASHKENT_OFFSET_MS } from "@/lib/date";

// ─── Turlar (API kontrakti) ───────────────────────────────────────────────────

type Load = "EMPTY" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL";

type OchiqReys = {
  tripId: number;
  legId: number;
  seq: number;
  vehicleId: number;
  plateNumber: string;
  brand: string;
  fromName: string;
  toName: string;
  toPointId: number;
  load: Load;
  departedAt: string;
};
type Vehicle = { id: number; plateNumber: string; brand: string; band: boolean; bandKim: string | null };
type Point = { id: number; name: string; isHub: boolean };
type HolatRes = {
  driver: { id: number; name: string };
  ochiqReys: OchiqReys | null;
  /**
   * Yetib borilgan, lekin yakunlanmagan reys (hub bo'lmagan nuqtaga kelindi).
   * SERVERDAN keladi — shu tufayli holat qurilmaga bog'liq emas: telefon
   * almashsa yoki WebView tozalansa ham haydovchi reysiga qaytadi.
   */
  kelindi: {
    tripId: number;
    vehicleId: number;
    plateNumber: string;
    brand: string;
    pointId: number | null;
    pointName: string | null;
    arrivedAt: string | null;
    /** O'tilgan yo'l: ["Ombor", "Chilonzor", "Yunusobod"] — oxirgisi joriy nuqta. */
    yol: string[];
  } | null;
  vehicles: Vehicle[];
  points: Point[];
  oxirgiVehicleId: number | null;
  bugun: { reys: number; plecho: number };
};

/**
 * Hub bo'lmagan nuqtaga yetib kelgan holat — reys ochiq, lekin ochiq plecho yo'q.
 * `yol` — o'tilgan zanjir (serverdan); localStorage zaxirasida bo'lmasligi mumkin.
 */
type Kelish = { tripId: number; pointId: number; pointName: string; vaqt: number; yol?: string[] };

/**
 * "expired" — 401 MUVAFFAQIYATLI yuklanishdan KEYIN kelgan holat. Sabab odatda
 * initData muddati (verifyInitData maxAge = 1 soat): uzoq yo'nalishda haydovchi
 * ilovani ochiq qoldirib 1+ soat yursa, "Yetib bordim" 401 oladi. Bu RUXSAT
 * muammosi EMAS — "ID ni nazoratchiga yuboring" ekrani bu yerda yolg'on yo'l
 * ko'rsatardi, to'g'ri yechim — ilovani qayta ochish (initData yangilanadi).
 *
 * "tarmoq" — birinchi yuklashda ALOQA yiqilgan holat. Avval bu ham "denied" ga
 * tushardi va haydovchini "ID ni nazoratchiga yuboring" deb YOLG'ON yo'lga
 * boshlardi (tunnel/zaif signal = ruxsat muammosi emas). Endi ajratilgan:
 * 401 → denied/expired, fetch yiqilishi yoki 5xx → tarmoq (qayta urinish bilan).
 */
type Faza = "loading" | "denied" | "expired" | "tarmoq" | "app";

const YUKLAR: { key: Load; label: string; fill: number }[] = [
  { key: "EMPTY", label: "Bo'sh", fill: 0 },
  { key: "QUARTER", label: "¼", fill: 25 },
  { key: "HALF", label: "½", fill: 50 },
  { key: "THREE_QUARTER", label: "¾", fill: 75 },
  { key: "FULL", label: "To'la", fill: 100 },
];
const yukLabel = (l: Load) => YUKLAR.find((y) => y.key === l)?.label ?? l;

// ─── Yordamchilar ─────────────────────────────────────────────────────────────

const KELISH_KEY = "logistika:kelish";
const CEID_KEY = "logistika:ceid";

const ls = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

/** Saqlangan niyat: kalit + yaratilgan payt + payload imzosi. */
type Ceid = { id: string; ts: number; sig: string };

/** Niyat "eskirish" muddati — undan keyin kalit qayta ishlatilmaydi. */
const CEID_TTL_MS = 30 * 60_000;

/**
 * Niyat uchun barqaror UUID: bor bo'lsa qayta ishlatiladi (takror yozuvni to'sadi).
 *
 * Kalit AKSIYA + PAYLOAD IMZOSIGA bog'langan va TTL bilan cheklangan. Ikkalasi ham
 * kerak, chunki kalit faqat javob kelganda tozalanadi:
 *   - imzo bo'lmasa: tarmoq uzilgach haydovchi yo'nalishni o'zgartirib qayta bossa,
 *     server ESKI reysni replay qilib "yozildi" deb ko'rsatardi (yolg'on tasdiq);
 *   - TTL bo'lmasa: javobi yo'qolgan kalit abadiy qolib, keyingi reyslar ham
 *     replay bo'lardi — haydovchi butunlay qulflanardi (localStorage'ni u tozalay
 *     olmaydi, ilovani qayta ochish ham yordam bermaydi).
 */
function ceidOl(aksiya: string, imzo: string): string {
  const k = `${CEID_KEY}:${aksiya}`;
  const xom = ls.get(k);
  if (xom) {
    try {
      const c = JSON.parse(xom) as Ceid;
      if (c?.id && c.sig === imzo && Date.now() - c.ts < CEID_TTL_MS) return c.id;
    } catch { /* buzuq yozuv — yangisi bilan almashtiriladi */ }
  }
  const yangi: Ceid = {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
    ts: Date.now(),
    sig: imzo,
  };
  ls.set(k, JSON.stringify(yangi));
  return yangi.id;
}
const ceidTozala = (aksiya: string) => ls.del(`${CEID_KEY}:${aksiya}`);

/**
 * Tarmoq yiqilishi (fetch reject / timeout) — RUXSAT xatosidan ajratish uchun
 * alohida tur. Mount yo'li shu turga qarab "tarmoq" ekranini ko'rsatadi.
 *
 * `sabab` ikkiga bo'linadi, chunki tashxis HAR XIL:
 *   "aloqa"  — fetch umuman ketmadi (tunnel, zaif signal) → haydovchi o'zi hal qiladi;
 *   "server" — so'rov yetib bordi, lekin 5xx qaytdi (Neon/Prisma yiqilishi) → butun
 *              parkka "internetingizni tekshiring" desak hech kim eskalatsiya qilmaydi.
 */
type TarmoqSabab = "aloqa" | "server";
class TarmoqXatosi extends Error {
  readonly sabab: TarmoqSabab;
  constructor(sabab: TarmoqSabab = "aloqa") {
    super(sabab);
    this.name = "TarmoqXatosi";
    this.sabab = sabab;
  }
}

/** Bitta so'rov uchun maksimal kutish — undan keyin abort. */
const POST_TIMEOUT_MS = 12_000;

async function post<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Partial<T> & { xato?: string; ok?: boolean; replay?: boolean } }> {
  const tg = window.Telegram?.WebApp;
  // AbortSignal.timeout() ATAYLAB ishlatilmaydi: eski Android WebView'da u
  // undefined bo'lib, post()ning O'ZI TypeError tashlardi va ilova o'sha
  // qurilmalarda butunlay ishlamay qolardi. AbortController hamma joyda bor.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-init-data": tg?.initData ?? "" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch {
    // Uzilish ham, timeout ham bir xil ma'no: natija NOMA'LUM (ceid saqlanadi).
    throw new TarmoqXatosi();
  } finally {
    clearTimeout(t);
  }
  let data: Partial<T> & { xato?: string; ok?: boolean; replay?: boolean } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch { /* JSON emas (502/HTML) — bo'sh obyekt bilan davom etamiz */ }
  return { status: res.status, data };
}

const haptic = {
  tanla: () => window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(),
  bos: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"),
  ok: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),
  xato: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),
};

/**
 * Bot API kengaytmalari — global TgWebApp tipida yo'q, shu yerda olinadi.
 * (Global tipni O'ZGARTIRMAYMIZ: uni boshqa miniapp'lar ulashadi.)
 */
type TgLoc = { latitude?: number; longitude?: number } | null | undefined;
type TgExt = {
  isVersionAtLeast?: (v: string) => boolean;
  offEvent?: (event: string, cb: () => void) => void;
  LocationManager?: {
    isInited?: boolean;
    isLocationAvailable?: boolean;
    init: (cb?: () => void) => void;
    getLocation: (cb: (loc: TgLoc) => void) => void;
  };
};
const tgExt = (): TgExt | undefined => window.Telegram?.WebApp as unknown as TgExt | undefined;

/** GPS natijasi — sabab bilan (UI "GPS yo'q" ni ko'rsata olishi uchun). */
type GpsNatija = { lat?: number; lng?: number; sabab?: "yoq" | "rad" | "timeout" };

type Lm = NonNullable<TgExt["LocationManager"]>;

/**
 * `init()` uchun YAGONA va'da (modul darajasida).
 *
 * Zarur, chunki `init()` tugaguncha `isInited` false qolaveradi: mount'dagi
 * isitish hali ketayotganda haydovchi tugmani bossa, `gpsOl` IKKINCHI `init()`
 * ni parallel chaqirardi. Endi ikkinchi chaqiruvchi birinchisining va'dasini
 * kutadi. Rad etilmaydi — chaqiruvchida 3s taymer baribir bor.
 */
let lmInit: Promise<void> | null = null;
function lmTayyorla(lm: Lm): Promise<void> {
  if (lm.isInited) return Promise.resolve();
  if (lmInit) return lmInit;
  const p = new Promise<void>((resolve) => {
    try { lm.init(() => resolve()); } catch { resolve(); }
  });
  // Tugagach memo BO'SHATILADI: init muvaffaqiyatsiz bo'lib `isInited` false
  // qolsa, keyingi bosish qaytadan urina olsin — allaqachon bajarilgan
  // va'daga abadiy bog'lanib qolmasin. Muvaffaqiyatda yuqoridagi `isInited`
  // qisqa tutashuvi baribir init'ni takrorlashga yo'l qo'ymaydi.
  void p.then(() => { lmInit = null; });
  lmInit = p;
  return p;
}

/**
 * GPS olishga urinish — HECH QACHON rad etmaydi va 3 soniyadan ortiq kutmaydi.
 * Muvaffaqiyatsiz bo'lsa koordinatasiz natija qaytadi va so'rov baribir ketadi.
 *
 * `sabab` FAQAT UI uchun — payload'ga tushmaydi (yuborishdan oldin ajratiladi).
 */
function gpsOl(): Promise<GpsNatija> {
  return new Promise((resolve) => {
    let tugadi = false;
    const tugat = (v: GpsNatija) => {
      if (tugadi) return;
      tugadi = true;
      clearTimeout(timer); // timer shu paytga qadar albatta tayinlangan (callback async)
      resolve(v);
    };
    const timer = setTimeout(() => tugat({ sabab: "timeout" }), 3000);
    try {
      const tg = tgExt();
      const lm = tg?.LocationManager;
      if (!lm || !tg?.isVersionAtLeast?.("8.0")) return tugat({ sabab: "yoq" });
      const olish = () =>
        lm.getLocation((loc) =>
          tugat(
            loc && typeof loc.latitude === "number" && typeof loc.longitude === "number"
              ? { lat: loc.latitude, lng: loc.longitude }
              : { sabab: "rad" },
          ),
        );
      if (lm.isInited) olish();
      else void lmTayyorla(lm).then(olish);
    } catch {
      tugat({ sabab: "yoq" });
    }
  });
}

/**
 * LocationManager'ni mount'da ISITISH — faqat `init()` latensiyasi uchun.
 *
 * DIQQAT: bu ruxsat oynasini CHIQARMAYDI — Bot API'da nativ so'rovni
 * `getLocation()` ochadi. Ya'ni yangi haydovchining birinchi bosishida
 * 3s byudjetning bir qismi baribir ruxsat dialogiga ketadi va o'sha
 * birinchi plecho koordinatasiz qolishi mumkin. Bu yerda faqat init
 * RTT'si tejaladi; ruxsatni oldindan olish yo'li alohida qaror talab
 * qiladi (ilova ochilishi bilan dialog chiqarish agressiv ko'rinadi).
 */
function gpsIsit() {
  try {
    const tg = tgExt();
    const lm = tg?.LocationManager;
    if (lm && !lm.isInited && tg?.isVersionAtLeast?.("8.0")) void lmTayyorla(lm);
  } catch { /* ixtiyoriy — jim o'tamiz */ }
}

/** "09:05" — Toshkent (UTC+5, DST yo'q), locale'ga bog'liq emas. */
function soat(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** "1s 20d" / "45d" */
function davomiylik(ms: number): string {
  const d = Math.max(0, Math.floor(ms / 60000));
  const s = Math.floor(d / 60);
  return s > 0 ? `${s}s ${d % 60}d` : `${d}d`;
}

const TARMOQ_XATO = "Aloqa yo'q. Qayta bosing — takror yozilmaydi.";

/** Yakun ekrani holat yangilanishini kutishi mumkin bo'lgan MAKSIMAL vaqt. */
const YAKUN_KUTISH_MS = 2500;

// ─── Asosiy komponent ─────────────────────────────────────────────────────────

export function LogistikaApp() {
  const [faza, setFaza] = useState<Faza>("loading");
  /** "tarmoq" ekranining tashxisi — aloqa yo'qmi yoki server yiqilganmi. */
  const [tarmoqSabab, setTarmoqSabab] = useState<TarmoqSabab>("aloqa");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tgId, setTgId] = useState<number | null>(null);

  const [holat, setHolat] = useState<HolatRes | null>(null);
  const [kelish, setKelish] = useState<Kelish | null>(null);
  const [yakun, setYakun] = useState(false);
  const [xato, setXato] = useState("");
  /** "info" — xato emas, ogohlantirish (masalan replay). Qizil banner chalg'itmasin. */
  const [xatoTur, setXatoTur] = useState<"xato" | "info">("xato");
  const [pending, setPending] = useState(false);
  /** Oxirgi aksiyada GPS olindimi — "📍 GPS yo'q" ishorasi uchun (to'smaydi). */
  const [gpsYoq, setGpsYoq] = useState(false);

  // Ekran A tanlovlari
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [fromOchiq, setFromOchiq] = useState(false);

  const yakunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Kamida bir marta muvaffaqiyatli yuklandimi — 401 ma'nosini shu hal qiladi. */
  const yuklandi = useRef(false);

  /** 401: hech qachon yuklanmagan bo'lsa — haydovchi emas; aks holda — sessiya eskirgan. */
  const ruxsatsiz = useCallback(() => {
    setFaza(yuklandi.current ? "expired" : "denied");
  }, []);

  /**
   * Sovuq start yiqilishini ekranga aylantirish: tarmoq turi bo'lsa sababi
   * bilan "tarmoq", aks holda "denied". Mount va "Qayta urinish" bir xil
   * tashxis qo'yishi uchun bitta joyda.
   */
  const yiqildi = useCallback((e: unknown) => {
    if (e instanceof TarmoqXatosi) {
      setTarmoqSabab(e.sabab);
      setFaza("tarmoq");
    } else {
      setFaza("denied");
    }
  }, []);

  /** Bannerni ko'rsatish: matn + tur (qizil xato yoki neytral ogohlantirish). */
  const ogohla = useCallback((matn: string, tur: "xato" | "info" = "xato") => {
    setXato(matn);
    setXatoTur(tur);
  }, []);

  /**
   * Holatni serverdan olish. birinchi=true bo'lsa localStorage'dagi "kelish" tiklanadi.
   *
   * useCallback([]) — faqat barqaror setter'lar va ref'lar ishlatiladi, shu sababli
   * mount effekti uni haqiqiy bog'liqlik sifatida ko'rsata oladi (lint jim, lekin
   * bog'liqlik ro'yxati YOLG'ON emas).
   */
  const yukla = useCallback(async (birinchi = false) => {
    const { status, data } = await post<HolatRes>("/api/logistika/holat", {});
    if (status === 401) { ruxsatsiz(); return; }
    // 5xx / 502-HTML — bu SERVER yoki oraliq tugun muammosi, ruxsat emas:
    // mount yo'li shundan "tarmoq" ekranini ajratadi.
    if (status >= 500 || (status !== 200 && !data.xato)) throw new TarmoqXatosi("server");
    if (status !== 200 || !data.driver) throw new Error(data.xato ?? "Xatolik yuz berdi");
    const h = data as HolatRes;
    setHolat(h);

    // "Kelindi" holati endi SERVERDAN keladi (h.kelindi) — localStorage faqat
    // zaxira. Shu sababli telefon almashsa, WebView tozalansa yoki ilova boshqa
    // qurilmada ochilsa ham haydovchi o'z ochiq reysiga qaytadi (avval bu holat
    // faqat localStorage'da yashardi va yo'qolsa haydovchi qulflanardi:
    // moshinasi band, yangi reys 409, eskisini yopolmaydi).
    if (h.ochiqReys) {
      setKelish(null);
      ls.del(KELISH_KEY);
    } else if (h.kelindi?.tripId != null && h.kelindi.pointId != null) {
      const k: Kelish = {
        tripId: h.kelindi.tripId,
        pointId: h.kelindi.pointId,
        pointName: h.kelindi.pointName ?? "",
        vaqt: h.kelindi.arrivedAt ? new Date(h.kelindi.arrivedAt).getTime() : Date.now(),
        yol: h.kelindi.yol,
      };
      setKelish(k);
      ls.set(KELISH_KEY, JSON.stringify(k));
    } else if (birinchi) {
      // Server "kelindi" bermadi — zaxira sifatida localStorage'ni bir marta o'qiymiz.
      const xom = ls.get(KELISH_KEY);
      if (xom) {
        try {
          const k = JSON.parse(xom) as Kelish;
          if (typeof k?.tripId === "number" && typeof k?.pointId === "number") setKelish(k);
          else ls.del(KELISH_KEY);
        } catch { ls.del(KELISH_KEY); }
      }
    } else {
      // Server ham, zaxira ham yo'q — holat tugagan.
      setKelish(null);
      ls.del(KELISH_KEY);
    }

    // Standart tanlovlar — foydalanuvchi tanlaganini bekor qilmaydi, faqat
    // bo'sh yoki endi band bo'lib qolgan moshinani almashtiradi.
    const bosh = h.vehicles.filter((v) => !v.band);
    const nomzod =
      bosh.find((v) => v.id === h.oxirgiVehicleId)?.id ?? bosh[0]?.id ?? null;
    setVehicleId((cur) => (cur != null && bosh.some((v) => v.id === cur) ? cur : nomzod));
    const hub = h.points.find((p) => p.isHub)?.id ?? h.points[0]?.id ?? null;
    setFromId((cur) => (cur != null && h.points.some((p) => p.id === cur) ? cur : hub));
    yuklandi.current = true;
    setFaza("app");
  }, [ruxsatsiz]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    // Pastga surish Telegram uchun "yopish" jesti: kengaytirilgan ilovada
    // haydovchi yangilash uchun instinktiv tortsa mini-app yopilardi.
    if (tg?.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes?.();
    gpsIsit(); // init RTT'si birinchi bosishdan OLDIN sarflansin (ruxsat dialogi emas)
    const temaOzgardi = () => setTheme(window.Telegram?.WebApp?.colorScheme ?? "light");
    tg?.onEvent?.("themeChanged", temaOzgardi);
    (async () => {
      setTheme(tg?.colorScheme ?? "light");
      setTgId(tg?.initDataUnsafe?.user?.id ?? null);
      try {
        await yukla(true);
      } catch (e) {
        // Tarmoq yiqilishi RUXSAT muammosi emas — aks holda haydovchi
        // "ID ni nazoratchiga yuboring" deb yolg'on yo'lga boshlanardi.
        yiqildi(e);
      }
    })();
    return () => {
      if (yakunTimer.current) clearTimeout(yakunTimer.current);
      tgExt()?.offEvent?.("themeChanged", temaOzgardi);
    };
  }, [yukla, yiqildi]);

  /**
   * Reys yakunlandi bayrog'i — 2 soniyalik tasdiq ekrani.
   *
   * yukla() taymer bilan PARALLEL boshlanadi: aks holda kutish 2000ms + tarmoq
   * RTT bo'lardi va taymer tugagach eski `holat` bilan endigina yopilgan reys
   * yana "Yo'lda" kartasi bo'lib chaqnab ketardi.
   *
   * Kutishga YUQORI CHEGARA qo'yilgan: usiz chiqish max(2000ms, yukla RTT) edi,
   * ya'ni zaif tarmoqda post() 12s timeoutigacha ekran qotib turardi — u yerda
   * xato banneri ham ko'rinmaydi (render `if (yakun)` da bannerdan OLDIN
   * qaytadi), tugma ham yo'q. Chegara tugagach ilova o'z ekraniga qaytadi;
   * yukla kechroq tugasa `holat` baribir yangilanadi, xato bo'lsa banner
   * o'sha yerda ko'rinadi.
   */
  const yakunKorsat = () => {
    setYakun(true);
    setGpsYoq(false); // yangi reys uchun toza boshlanish (yakunda GPS o'lchanmaydi)
    if (yakunTimer.current) clearTimeout(yakunTimer.current); // qayta chaqirilsa eskisi qolmasin
    const yangilash = Promise.race([
      yukla().catch(() => ogohla(TARMOQ_XATO)),
      new Promise<void>((r) => setTimeout(r, YAKUN_KUTISH_MS)),
    ]);
    yakunTimer.current = setTimeout(() => {
      void yangilash.then(() => {
        setYakun(false);
        setToId(null);
      });
    }, 2000);
  };

  /** Barcha aksiyalar uchun umumiy qobiq: pending, GPS, ceid, xato, haptic. */
  const yubor = async (
    aksiya: string,
    path: string,
    /** Kalit imzosi — payload'ning ma'noli qismi (ceid shunga bog'lanadi). */
    imzo: string,
    payload: (ceid: string, gps: { lat?: number; lng?: number }, clientAt: string) => Record<string, unknown>,
    gpsKerak: boolean,
    muvaffaq: (data: Record<string, unknown>) => Promise<void> | void,
  ) => {
    if (pending) return;
    setPending(true);
    setXato("");
    haptic.bos();
    const clientAt = new Date().toISOString(); // bosilgan payt — GPS kutishidan OLDIN
    const ceid = ceidOl(aksiya, imzo);
    try {
      const g: GpsNatija = gpsKerak ? await gpsOl() : {};
      if (gpsKerak) setGpsYoq(g.lat === undefined);
      const gps = g.lat !== undefined && g.lng !== undefined ? { lat: g.lat, lng: g.lng } : {};
      const { status, data } = await post<Record<string, unknown>>(path, payload(ceid, gps, clientAt));
      // 5xx da niyat SAQLANADI: server yozdimi-yo'qmi noma'lum, yangi kalit bilan
      // qayta yuborsak replay ishlamay, haydovchi "moshina band: <o'z ismi>"
      // degan tushunarsiz 409 ni olardi.
      if (status < 500) ceidTozala(aksiya);
      if (status === 401) { ruxsatsiz(); return; }
      if (status !== 200 || data.ok === false) {
        haptic.xato();
        ogohla(data.xato ?? "Xatolik yuz berdi");
        return;
      }
      if (data.replay) {
        // Server "bu allaqachon yozilgan" dedi — bu MUVAFFAQIYAT emas, takror.
        // Jim "ok" haptikasi bersak haydovchi yangi fakt yozildi deb o'ylardi.
        haptic.tanla();
        ogohla("Bu amal allaqachon yozilgan edi — holat yangilandi.", "info");
      } else {
        haptic.ok();
      }
      await muvaffaq(data as Record<string, unknown>);
    } catch {
      // Tarmoq uzildi — natija NOMA'LUM, ceid saqlanib qoladi (qayta bosish xavfsiz).
      haptic.xato();
      ogohla(TARMOQ_XATO);
    } finally {
      setPending(false);
    }
  };

  const yolgaChiq = (load: Load) => {
    if (vehicleId == null || fromId == null || toId == null) return;
    return yubor(
      "yolga",
      "/api/logistika/yolga-chiqdim",
      `${vehicleId}-${fromId}-${toId}-${load}`,
      (clientEventId, gps, clientAt) => ({
        clientEventId, vehicleId, fromPointId: fromId, toPointId: toId, load, clientAt, ...gps,
      }),
      true,
      async () => { setToId(null); await yukla(); },
    );
  };

  const yetibBor = () => {
    const or = holat?.ochiqReys;
    if (!or) return;
    return yubor(
      "yetib",
      "/api/logistika/yetib-bordim",
      String(or.legId),
      (clientEventId, gps, clientAt) => ({ clientEventId, legId: or.legId, clientAt, ...gps }),
      true,
      async (data) => {
        if (data.tripYopildi) {
          setKelish(null);
          ls.del(KELISH_KEY);
          yakunKorsat();
          return;
        }
        const k: Kelish = { tripId: or.tripId, pointId: or.toPointId, pointName: or.toName, vaqt: Date.now() };
        setKelish(k);
        ls.set(KELISH_KEY, JSON.stringify(k));
        setToId(null);
        await yukla();
      },
    );
  };

  const keyingiPlecho = (load: Load) => {
    if (!kelish || toId == null) return;
    return yubor(
      "keyingi",
      "/api/logistika/keyingi-plecho",
      `${kelish.tripId}-${toId}-${load}`,
      (clientEventId, gps, clientAt) => ({
        clientEventId, tripId: kelish.tripId, toPointId: toId, load, clientAt, ...gps,
      }),
      true,
      async () => {
        setKelish(null);
        ls.del(KELISH_KEY);
        setToId(null);
        await yukla();
      },
    );
  };

  const reysniYakunla = () => {
    const tripId = holat?.ochiqReys?.tripId ?? kelish?.tripId;
    if (tripId == null) return;
    // Hub bo'lmagan nuqtada yakunlangan bo'lsa, keyingi reys AYNAN SHU YERDAN
    // boshlanadi — "Qayerdan" ni hub'da qoldirsak haydovchi uni qo'lda
    // o'zgartirishga majbur bo'lardi (+2 bosish, quyoshda).
    const turganJoy = kelish?.pointId ?? null;
    return yubor(
      "yakun",
      "/api/logistika/reysni-yakunla",
      String(tripId),
      (clientEventId) => ({ clientEventId, tripId }),
      false,
      async () => {
        setKelish(null);
        ls.del(KELISH_KEY);
        if (turganJoy != null) setFromId(turganJoy);
        yakunKorsat();
      },
    );
  };

  /**
   * Holatni serverdan qayta o'qish.
   *
   * "kelindi" holati ATAYLAB O'CHIRILMAYDI: `holat` javobida ochiq PLECHOSI yo'q,
   * lekin hali OPEN turgan reysni bildiruvchi maydon yo'q — ya'ni kelish.tripId
   * shu reysga yagona ishoradir. Uni tashlab yuborsak haydovchi qulflanib qolardi:
   * moshinasi (o'z reysi tufayli) band ko'rinadi, yangi reys ocholmaydi, eskisini
   * ham yopolmaydi. Eskirgan holatdan chiqish yo'li — "Reysni yakunlash": u
   * idempotent, allaqachon yopilgan reys uchun ham ok:true qaytaradi.
   */
  const yangila = () => {
    haptic.tanla();
    setXato("");
    setToId(null);
    void yukla().catch(() => ogohla(TARMOQ_XATO));
  };

  /** Sovuq startdan keyin qayta urinish (tarmoq/denied ekranlaridan). */
  const qaytaUrin = () => {
    haptic.tanla();
    setXato("");
    setFaza("loading");
    void yukla(true).catch(yiqildi);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (faza === "loading") {
    return (
      <Qobiq theme={theme}>
        <div className="center">
          <div className="spin" aria-hidden="true" />
          <p className="muted">Yuklanmoqda…</p>
        </div>
      </Qobiq>
    );
  }

  if (faza === "expired") {
    return (
      <Qobiq theme={theme}>
        <div className="card center" style={{ marginTop: 28 }}>
          <div className="lockic">⏳</div>
          <h2>Sessiya eskirdi</h2>
          <p className="muted">
            Ilovani yopib, Telegram&apos;dan qayta oching va amalni takrorlang.
            Yozib ulgurilgan reyslar joyida turadi.
          </p>
        </div>
      </Qobiq>
    );
  }

  // Tarmoq yiqilishi — RUXSAT ekranidan ATAYLAB ajratilgan: bu yerda haydovchi
  // ID sini yubormasligi, avval qayta urinishi kerak.
  if (faza === "tarmoq") {
    // 5xx ni "internetni tekshiring" deb ko'rsatish YOLG'ON tashxis: Neon/Prisma
    // yiqilsa butun park o'z telefonini ayblab, hech kim eskalatsiya qilmasdi.
    const server = tarmoqSabab === "server";
    return (
      <Qobiq theme={theme}>
        <div className="card center" style={{ marginTop: 28 }}>
          <div className="lockic">{server ? "🛠️" : "📡"}</div>
          <h2>{server ? "Server javob bermayapti" : "Aloqa yo'q"}</h2>
          <p className="muted">
            {server
              ? "Bu telefoningizdagi muammo emas. Biroz kutib qayta uring — takrorlansa logistika nazoratchisiga xabar bering."
              : "Internet signalini tekshiring."}{" "}
            Yozib ulgurilgan reyslar joyida turadi.
          </p>
          <button className="retry" onClick={qaytaUrin}>↻ Qayta urinish</button>
        </div>
      </Qobiq>
    );
  }

  if (faza === "denied" || !holat) {
    return (
      <Qobiq theme={theme}>
        <div className="card center" style={{ marginTop: 28 }}>
          <div className="lockic">🔒</div>
          <h2>Ruxsat yo&apos;q</h2>
          {tgId != null && <IdNusxa id={tgId} />}
          <p className="muted">Bu ID ni logistika nazoratchisiga yuboring.</p>
          {/* IKKILAMCHI uslub ATAYLAB: bu ekranda "Qayta urinish" ko'p hollarda
              boshi berk halqa (haydovchi ro'yxatda yo'q — ruxsat berilmaguncha
              natija o'zgarmaydi). Asosiy gradient tugma bo'lganida u ekrandagi
              eng ko'zga tashlanadigan element bo'lib, yagona ISHLAYDIGAN
              harakatni — ID ni yuborishni — bosib qo'yardi. */}
          <button className="retry ghost" onClick={qaytaUrin}>↻ Qayta urinish</button>
        </div>
      </Qobiq>
    );
  }

  if (yakun) {
    return (
      <Qobiq theme={theme}>
        <div className="finish">
          <div className="fic">🎉</div>
          <h2>Reys yakunlandi</h2>
          <p className="muted">Rahmat! Yangi reysga tayyorlanmoqda…</p>
        </div>
      </Qobiq>
    );
  }

  const or = holat.ochiqReys;
  const nuqtalar = holat.points;

  return (
    <Qobiq theme={theme}>
      <header className="brandbar">
        <span className="branddot" />
        <b>{holat.driver.name}</b>
        {gpsYoq && <span className="gpschip" title="Koordinata yozilmadi">📍 GPS yo&apos;q</span>}
        <small>{holat.bugun.reys} reys · {holat.bugun.plecho} plecho</small>
      </header>

      {/* Sticky: uzun ro'yxatlarda pastga skroll qilingan haydovchi ham xabarni
          ko'radi (avval banner sahifa tepasida qolib, ekrandan chiqib ketardi). */}
      {xato && (
        <div className={`xato ${xatoTur === "info" ? "info" : ""}`} role="alert" aria-live="assertive">
          <span className="xic">{xatoTur === "info" ? "ℹ️" : "⚠️"}</span>
          <span className="xtxt">{xato}</span>
          {/* Faqat XATO bannerida va "Yangilash" nomi bilan. Avval u har banneda
              "↻ Qayta urinish" deb turardi va ikki marta chalg'itardi:
              (a) info bannerda ("01A123BB hozir yo'lda: …") urinadigan amal yo'q;
              (b) tarmoq xatosida matn "Qayta bosing" (= yuk chipini) deydi,
              tugma esa toId ni tozalab yuk panelini YOPIB yuborardi. */}
          {xatoTur === "xato" && (
            <button className="xbtn" onClick={yangila}>↻ Yangilash</button>
          )}
        </div>
      )}

      {or ? (
        <Yolda
          reys={or}
          pending={pending}
          onYetibBor={yetibBor}
          onYakunla={reysniYakunla}
        />
      ) : kelish ? (
        <Kelindi
          kelish={kelish}
          nuqtalar={nuqtalar}
          toId={toId}
          setToId={setToId}
          pending={pending}
          onYuk={keyingiPlecho}
          onYakunla={reysniYakunla}
          onYangila={yangila}
        />
      ) : (
        <Bosh
          holat={holat}
          vehicleId={vehicleId}
          setVehicleId={setVehicleId}
          fromId={fromId}
          setFromId={setFromId}
          toId={toId}
          setToId={setToId}
          fromOchiq={fromOchiq}
          setFromOchiq={setFromOchiq}
          pending={pending}
          onYuk={yolgaChiq}
          onBand={(v) => {
            haptic.xato();
            ogohla(`${v.plateNumber} hozir yo'lda: ${v.bandKim ?? "boshqa haydovchi"}`, "info");
          }}
        />
      )}
    </Qobiq>
  );
}

// ─── Ekran A — BOSH ───────────────────────────────────────────────────────────

function Bosh(props: {
  holat: HolatRes;
  vehicleId: number | null;
  setVehicleId: (id: number) => void;
  fromId: number | null;
  setFromId: (id: number) => void;
  toId: number | null;
  setToId: (id: number | null) => void;
  fromOchiq: boolean;
  setFromOchiq: (v: boolean) => void;
  pending: boolean;
  onYuk: (l: Load) => void;
  onBand: (v: Vehicle) => void;
}) {
  const { holat, vehicleId, setVehicleId, fromId, setFromId, toId, setToId, fromOchiq, setFromOchiq, pending, onYuk, onBand } = props;

  // Oxirgi ishlatilgan moshina birinchi o'rinda, band bo'lganlari eng oxirida.
  const avtolar = [...holat.vehicles].sort((a, b) => {
    if (a.band !== b.band) return a.band ? 1 : -1;
    if (a.id === holat.oxirgiVehicleId) return -1;
    if (b.id === holat.oxirgiVehicleId) return 1;
    return a.plateNumber.localeCompare(b.plateNumber);
  });
  const fromName = holat.points.find((p) => p.id === fromId)?.name ?? "—";
  const toName = holat.points.find((p) => p.id === toId)?.name ?? "";
  const tayyor = vehicleId != null && fromId != null && toId != null;
  // Bo'sh moshina qolmasa yuk paneli chiqmaydi — sababini aytib qo'yamiz.
  const bandHammasi = avtolar.length > 0 && avtolar.every((v) => v.band);

  return (
    <>
      <h3 className="sec">Moshina</h3>
      <div className="vlist">
        {avtolar.map((v) => (
          <button
            key={v.id}
            className={`vcard ${v.id === vehicleId ? "on" : ""} ${v.band ? "band" : ""}`}
            /* `disabled` EMAS: nativ disabled bosishni butunlay yutadi va haydovchi
               nol javob oladi — karta "buzuq"dek ko'rinadi. Bosish sezilib,
               SABAB banner bo'lib chiqadi.
               `aria-disabled` ham YO'Q: karta operatsional (bosilsa sabab beradi),
               "o'chirilgan" deyish ekran o'qiguvchiga yolg'on bo'lardi — sabab
               o'rniga nomga qo'shiladi. `aria-pressed` band kartada umuman
               berilmaydi: u tanlash toggle'i emas. */
            aria-label={v.band ? `${v.plateNumber} — ${v.bandKim ?? "boshqa haydovchi"} yo'lda` : undefined}
            aria-pressed={v.band ? undefined : v.id === vehicleId}
            onClick={() => {
              if (v.band) { onBand(v); return; }
              haptic.tanla();
              setVehicleId(v.id);
            }}
          >
            <span className="vic">🚚</span>
            <span className="vtxt">
              <b>{v.plateNumber}</b>
              <small>{v.band ? `${v.bandKim ?? "Boshqa haydovchi"} yo'lda` : v.brand}</small>
            </span>
            {v.band ? (
              <span className="vband">YO&apos;LDA</span>
            ) : (
              v.id === vehicleId && <span className="tick">✓</span>
            )}
          </button>
        ))}
        {avtolar.length === 0 && (
          <div className="bosh">
            <b>🚚 Moshina topilmadi</b>
            <p className="muted">Ma&apos;lumotnomada faol moshina yo&apos;q. Logistika nazoratchisiga xabar bering.</p>
          </div>
        )}
        {bandHammasi && (
          <p className="muted">Barcha moshinalar yo&apos;lda — bo&apos;shaganda yo&apos;lga chiqa olasiz.</p>
        )}
      </div>

      {/* Ikki qator: uzun nuqta nomi ("Markaziy sklad (Sergeli)") tor ekranda
          qirqilib, farqlovchi qavs yo'qolib ketmasin. */}
      <div className="fromrow">
        <div className="ftxt">
          <span className="flbl">Qayerdan</span>
          <b className="fval">{fromName}</b>
        </div>
        <button className="flink" onClick={() => { haptic.tanla(); setFromOchiq(!fromOchiq); }}>
          {fromOchiq ? "Yopish" : "O'zgartirish"}
        </button>
      </div>
      {fromOchiq && (
        <NuqtaGrid
          nuqtalar={holat.points}
          tanlangan={fromId}
          onTanla={(id) => { haptic.tanla(); setFromId(id); setFromOchiq(false); if (id === toId) setToId(null); }}
        />
      )}

      <h3 className="sec">Qayerga</h3>
      <NuqtaGrid
        nuqtalar={holat.points.filter((p) => p.id !== fromId)}
        tanlangan={toId}
        onTanla={(id) => { haptic.tanla(); setToId(id === toId ? null : id); }}
      />

      {tayyor && (
        <YukPanel
          sarlavha={`${fromName} → ${toName}`}
          pending={pending}
          onYuk={onYuk}
          onBekor={() => setToId(null)}
        />
      )}
    </>
  );
}

// ─── Ekran B — YO'LDA ─────────────────────────────────────────────────────────

function Yolda({ reys, pending, onYetibBor, onYakunla }: {
  reys: OchiqReys; pending: boolean; onYetibBor: () => void; onYakunla: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // setState interval callback'da — effekt tanasida sinxron emas (hooks lint qoidasi).
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const otgan = davomiylik(now - new Date(reys.departedAt).getTime());

  return (
    <>
      <div className="trip">
        <span className="tpill">Yo&apos;lda · {reys.seq}-plecho</span>
        <div className="troute">
          <span className="tfrom">{reys.fromName}</span>
          <span className="tarr">→</span>
          <span className="tto">{reys.toName}</span>
        </div>
        <div className="tmeta">
          <span>🕐 {soat(reys.departedAt)} dan beri · <b>{otgan}</b></span>
        </div>
        <div className="tfoot">
          <span className="tchip">🚚 {reys.plateNumber}</span>
          <span className="tchip">📦 {yukLabel(reys.load)}</span>
        </div>
      </div>

      <div className="bar">
        <div className="barcol">
          <button className="big" disabled={pending} onClick={onYetibBor}>
            {pending ? "Yuborilmoqda…" : "✅ Yetib bordim"}
          </button>
          {/* Qaytarib bo'lmaydigan amal asosiy tugmadan AJRATILGAN (chiziq +
              bo'shliq + qizil uslub) va ikki bosish talab qiladi. */}
          <div className="dangrow">
            <YakunTugma pending={pending} onYakunla={onYakunla} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * "Reysni yakunlash" — QAYTARIB BO'LMAYDIGAN amal, shuning uchun ikki bosishli.
 *
 * Modal tasdiq o'rniga o'zini-o'zi qurollantiruvchi tugma: birinchi bosish uni
 * qizil "Tasdiqlang" holatiga o'tkazadi, 4 soniyada o'zi qaytadi. Sabab —
 * yakunlash ochiq plechoni ham `arrivedAt = hozir` bilan yopadi, ya'ni bitta
 * tasodifiy bosish borilmagan nuqtaga SOXTA "yetib bordim" faktini yozadi va
 * ilova ichida qaytarish yo'li yo'q.
 */
function YakunTugma({ pending, onYakunla }: { pending: boolean; onYakunla: () => void }) {
  const [tayyor, setTayyor] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const bos = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!tayyor) {
      haptic.tanla();
      setTayyor(true);
      timer.current = setTimeout(() => setTayyor(false), 4000);
      return;
    }
    setTayyor(false);
    onYakunla();
  };

  return (
    <button className={`link dang ${tayyor ? "armed" : ""}`} disabled={pending} onClick={bos}>
      {tayyor ? "⏹ Tasdiqlang — reys yakunlansin" : "Reysni yakunlash"}
    </button>
  );
}

// ─── Ekran C — YETIB BORDI ────────────────────────────────────────────────────

function Kelindi(props: {
  kelish: Kelish;
  nuqtalar: Point[];
  toId: number | null;
  setToId: (id: number | null) => void;
  pending: boolean;
  onYuk: (l: Load) => void;
  onYakunla: () => void;
  onYangila: () => void;
}) {
  const { kelish, nuqtalar, toId, setToId, pending, onYuk, onYakunla, onYangila } = props;
  const toName = nuqtalar.find((p) => p.id === toId)?.name ?? "";
  // 2 ta nuqtali zanjir kartaning o'zida ko'rinib turibdi — takrorlamaymiz.
  const yol = (kelish.yol?.length ?? 0) > 2 ? kelish.yol! : null;

  return (
    <>
      <div className="arrived">
        <div className="aic">📍</div>
        <div className="atxt">
          <b>{kelish.pointName} ga yetib bordingiz</b>
          <small>{soat(new Date(kelish.vaqt).toISOString())} · yozib olindi</small>
        </div>
        {/* "Yangilash" ATAYLAB shu yerda: avval u qaytarib bo'lmaydigan
            "Reysni yakunlash" bilan yonma-yon, piksel-bir xil turardi. */}
        <button className="arefresh" disabled={pending} onClick={onYangila} aria-label="Yangilash">↻</button>
      </div>

      {/* O'tilgan yo'l — 3-4 plecholi reysda "qayerlarda bo'ldim?" savoliga javob */}
      {yol && (
        <div className="yol">
          {yol.map((n, i) => (
            <span key={`${n}-${i}`} className={i === yol.length - 1 ? "yozor" : "yotgan"}>
              {i > 0 && <span className="yoarr">›</span>}
              {n}
            </span>
          ))}
        </div>
      )}

      <h3 className="sec">Keyingi yo&apos;nalish</h3>
      <NuqtaGrid
        nuqtalar={nuqtalar.filter((p) => p.id !== kelish.pointId)}
        tanlangan={toId}
        onTanla={(id) => { haptic.tanla(); setToId(id === toId ? null : id); }}
      />

      <div className="cfoot">
        <YakunTugma pending={pending} onYakunla={onYakunla} />
      </div>

      {toId != null && (
        <YukPanel
          sarlavha={`${kelish.pointName} → ${toName}`}
          pending={pending}
          onYuk={onYuk}
          onBekor={() => setToId(null)}
        />
      )}
    </>
  );
}

// ─── Umumiy bloklar ───────────────────────────────────────────────────────────

/**
 * Telegram ID — bosilganda nusxalanadi.
 *
 * Faqat `user-select: all` yetarli emas edi: Telegram WebView'da uzoq bosish
 * ishonchsiz, holbuki haydovchining ishga kirishi shu ID ni uzatishga bog'liq.
 * (Naqsh sotuv-app.tsx dagi `copyId` bilan bir xil.)
 */
function IdNusxa({ id }: { id: number }) {
  const [olindi, setOlindi] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const nusxa = () => {
    navigator.clipboard?.writeText(String(id)).then(
      () => {
        haptic.ok();
        setOlindi(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOlindi(false), 1600);
      },
      () => { /* ruxsat yo'q — matn baribir tanlanadi (user-select: all) */ },
    );
  };

  return (
    <button className="idbox" onClick={nusxa}>
      <span className="idnum">🆔 {id}</span>
      <span className="idc">{olindi ? "✅ nusxa olindi" : "📋 nusxa olish"}</span>
    </button>
  );
}

function NuqtaGrid({ nuqtalar, tanlangan, onTanla }: {
  nuqtalar: Point[]; tanlangan: number | null; onTanla: (id: number) => void;
}) {
  return (
    <div className="pgrid">
      {nuqtalar.map((p) => (
        <button
          key={p.id}
          className={`pbtn ${p.id === tanlangan ? "on" : ""} ${p.isHub ? "hub" : ""}`}
          aria-pressed={p.id === tanlangan}
          onClick={() => onTanla(p.id)}
        >
          {p.isHub && <span className="hdot" />}
          {p.name}
        </button>
      ))}
      {nuqtalar.length === 0 && (
        <div className="bosh">
          <b>🗺️ Yo&apos;nalish topilmadi</b>
          <p className="muted">
            Ma&apos;lumotnomada faol nuqta yo&apos;q yoki hammasi o&apos;chirilgan.
            Logistika nazoratchisiga xabar bering.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Yuk paneli — pastda qat'iy turadi. CHIPNING O'ZI jo'natish tugmasi:
 * alohida tasdiq yo'q, chunki har qo'shimcha bosish rulda vaqt yo'qotadi.
 */
function YukPanel({ sarlavha, pending, onYuk, onBekor }: {
  sarlavha: string; pending: boolean; onYuk: (l: Load) => void; onBekor: () => void;
}) {
  return (
    <div className="yukbar">
      <div className="barcol">
        <div className="yhead">
          <b>{sarlavha}</b>
          <button
            className="ybek"
            onClick={() => { haptic.tanla(); onBekor(); }}
            aria-label="Bekor qilish"
          >✕</button>
        </div>
        <div className="yhint">{pending ? "Yuborilmoqda…" : "Yukni bosing — shu zahoti jo'natiladi"}</div>
        <div className="ychips">
          {YUKLAR.map((y) => (
            <button key={y.key} className="ychip" disabled={pending} onClick={() => onYuk(y.key)}>
              <span className="ybar"><i style={{ height: `${y.fill}%` }} /></span>
              <span className="ylbl">{y.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Qobiq + dizayn tokenlari ("Fresh" tili, sotuv/kirish bilan bir xil) ──────

function Qobiq({ theme, children }: { theme: "light" | "dark"; children: React.ReactNode }) {
  return (
    <div className="wrap" data-theme={theme}>
      <div className="col">{children}</div>
      <style>{`
        /* .wrap — butun ekran foni (460px cheklov ICHKARIDA, .col da). Aks holda
           viewport 460px dan keng bo'lsa (Telegram Desktop) yon tomonlarda
           sahifaning global foni ko'rinib, kontent "qirqilgan"dek chiqadi.
           body ham bo'yaladi — iOS overscroll paytida seam chiqmasin. */
        body { background: var(--tg-theme-bg-color, #F4F7F5); }
        .wrap { min-height: 100dvh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased; background: var(--bg); color: var(--ink-1);

          --tg-bg:   var(--tg-theme-bg-color, #F4F7F5);
          --tg-text: var(--tg-theme-text-color, #0B1A14);
          --tg-hint: var(--tg-theme-hint-color, #8A9C93);
          --tg-card: var(--tg-theme-secondary-bg-color, #FFFFFF);
          --bg: var(--tg-bg); --card: var(--tg-card);
          --card-2: color-mix(in srgb, var(--tg-card) 55%, var(--bg));
          --ink-1: var(--tg-text);
          --ink-2: color-mix(in srgb, var(--tg-text) 60%, var(--tg-hint));
          /* MATN uchun: sof --tg-hint quyoshda o'qilmasdi (2.5-2.9:1 — AA'dan ham,
             AA-large'dan ham past), holbuki u ikkinchi darajali BARCHA matnni
             bo'yaydi. Matn rangiga aralashtirilgach ~6.5:1 bo'ladi va qorong'i
             temada ham o'tadi (--tg-text oq bo'lgani uchun aralashma yorishadi). */
          --ink-3: color-mix(in srgb, var(--tg-text) 45%, var(--tg-hint));
          /* Faqat DEKORATIV element uchun (ramka, ajratuvchi) — matn uchun EMAS. */
          --ink-4: var(--tg-hint);
          --line:   color-mix(in srgb, var(--tg-hint) 22%, transparent);
          --line-2: color-mix(in srgb, var(--tg-hint) 12%, transparent);

          --brand: #10B981; --brand-2: #059669; --brand-deep: #047857;
          --brand-soft: color-mix(in srgb, var(--brand) 14%, transparent);
          --grad: linear-gradient(152deg, #12B67F 0%, #0A8A63 52%, #065F46 100%);
          --yolda: #F59E0B; --yolda-soft: color-mix(in srgb, #F59E0B 15%, transparent);
          /* Chuqurlashtirilgan: avvalgi amber gradient ustida OQ matn 1.9-2.7:1
             berardi — kartadagi hech bir element (davlat raqami ham) AA'dan
             o'tmasdi. Bu to'xtashlarda oq matn 5.2-9.4:1. */
          --yolda-grad: linear-gradient(152deg, #C2410C 0%, #9A3412 55%, #7C2D12 100%);
          --xato-c: #E5484D; --xato-soft: color-mix(in srgb, #E5484D 13%, transparent);

          --shadow: 0 1px 2px rgba(8,30,20,.05), 0 12px 28px -16px rgba(8,30,20,.14);
          --lift: 0 10px 26px -10px rgba(16,185,129,.5); }

        .wrap[data-theme="dark"] {
          --card-2: color-mix(in srgb, var(--tg-card) 80%, #ffffff 5%);
          --line: color-mix(in srgb, var(--tg-hint) 32%, transparent);
          --shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 14px 32px -18px rgba(0,0,0,.65);
          --brand-soft: color-mix(in srgb, var(--brand) 22%, transparent); }

        .col { max-width: 460px; margin: 0 auto; padding: 4px 15px 210px; }

        button { font-family: inherit; cursor: pointer; }

        /* .branddot/small da flex:0 0 auto — aks holda uzun ism ikkalasini
           siqib, doira ellipsga aylanardi va chip ikki qatorga sinardi. */
        .brandbar { display: flex; align-items: center; gap: 9px; padding: 14px 2px 10px; }
        .branddot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft); }
        .brandbar b { min-width: 0; font-size: 16px; font-weight: 800; letter-spacing: -.3px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .brandbar small { margin-left: auto; flex: 0 0 auto; white-space: nowrap;
          font-size: 12.5px; font-weight: 700; color: var(--ink-3);
          background: var(--card-2); border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; }
        .gpschip { flex: 0 0 auto; font-size: 11.5px; font-weight: 800; white-space: nowrap;
          color: var(--xato-c); background: var(--xato-soft); border-radius: 999px; padding: 4px 9px; }

        .muted { color: var(--ink-3); font-size: 14px; line-height: 1.5; }
        .center { text-align: center; padding: 48px 16px; }
        .spin { width: 30px; height: 30px; margin: 0 auto 12px; border-radius: 50%;
          border: 3px solid var(--line); border-top-color: var(--brand); animation: sp .8s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }

        .sec { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px;
          color: var(--ink-3); margin: 16px 2px 8px; }

        /* Bo'sh holat — sabab + keyingi qadam (yalang'och "Nuqta yo'q." o'rniga) */
        .bosh { grid-column: 1 / -1; text-align: center; padding: 22px 16px;
          border: 1.5px dashed var(--line); border-radius: 18px; background: var(--card-2); }
        .bosh b { display: block; font-size: 15px; font-weight: 800; margin-bottom: 6px; }

        /* Xato — KATTA va ko'zga tashlanadigan (409: "band moshina").
           STICKY: uzun ro'yxatda pastga skroll qilgan haydovchi ham ko'radi. */
        .xato { position: sticky; top: 0; z-index: 25;
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--xato-soft);
          border: 1.5px solid color-mix(in srgb, var(--xato-c) 40%, transparent); border-radius: 16px;
          padding: 14px 15px; margin: 4px 0 12px; color: var(--xato-c); font-size: 15px; font-weight: 700; line-height: 1.4;
          backdrop-filter: blur(10px); animation: shake .3s ease; }
        .xato.info { background: var(--card-2); color: var(--ink-1);
          border-color: var(--line); animation: none; }
        .xic { font-size: 19px; line-height: 1.1; flex: 0 0 auto; }
        .xtxt { flex: 1 1 140px; min-width: 0; }
        .xbtn { flex: 0 0 auto; min-height: 40px; padding: 0 14px; border-radius: 12px; font-size: 13.5px;
          font-weight: 800; color: inherit; background: transparent;
          border: 1.5px solid color-mix(in srgb, currentColor 45%, transparent); }
        @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }

        /* Qayta urinish — sovuq start ekranlarida (tarmoq/ruxsat) */
        .retry { min-height: 56px; width: 100%; margin-top: 14px; border: 0; border-radius: 18px;
          background: var(--grad); color: #fff; font-size: 17px; font-weight: 800; box-shadow: var(--lift); }
        .retry:active { transform: scale(.98); }
        /* Ikkilamchi variant — "Ruxsat yo'q" ekrani uchun (u yerda qayta urinish
           odatda hech narsani o'zgartirmaydi, asosiy yo'l — ID ni yuborish). */
        /* Chegara --line'da 1.21:1 edi — tugmaning o'zi ko'rinmasdi. WCAG 1.4.11
           UI komponent chegarasi uchun ≥3:1 talab qiladi; --ink-2 ning 70% i
           oq kartada ≈3.6:1 beradi va ikkilamchi ko'rinishni ham saqlaydi. */
        .retry.ghost { background: var(--card-2); color: var(--ink-2);
          border: 1.5px solid color-mix(in srgb, var(--ink-2) 70%, transparent);
          box-shadow: none; font-size: 15.5px; min-height: 50px; }

        /* Moshina ro'yxati */
        .vlist { display: flex; flex-direction: column; gap: 8px; }
        .vcard { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 62px; text-align: left;
          background: var(--card); border: 1.5px solid var(--line); border-radius: 18px; padding: 10px 14px; color: inherit;
          box-shadow: var(--shadow); transition: transform .12s, border-color .15s, background .15s; }
        .vcard:active { transform: scale(.98); }
        .vcard.on { border-color: var(--brand); background: var(--brand-soft); }
        /* Band karta: avval opacity .5 + grayscale(1) edi — sabab matni 1.6:1 ga
           tushib, quyoshda karta "buzuq"dek ko'rinardi. Endi ma'noli belgi. */
        .vcard.band { background: var(--card-2); box-shadow: none; }
        .vic { font-size: 22px; }
        .vcard.band .vic { opacity: .6; }
        .vtxt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .vtxt b { font-size: 16px; font-weight: 800; letter-spacing: .3px; }
        .vtxt small { font-size: 13px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tick { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto;
          background: var(--grad); color: #fff; font-size: 14px; font-weight: 800; }
        .vband { flex: 0 0 auto; font-size: 11px; font-weight: 800; letter-spacing: .5px; color: var(--ink-2);
          border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; white-space: nowrap; }

        /* Qayerdan — IKKI QATOR: uzun nom ("Markaziy sklad (Sergeli)") tor
           ekranda qirqilib, farqlovchi qavs yo'qolib ketmasin. */
        .fromrow { display: flex; align-items: center; gap: 10px; margin: 14px 0 0; padding: 10px 12px 10px 14px;
          background: var(--card-2); border: 1px solid var(--line); border-radius: 16px; }
        .ftxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .flbl { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: var(--ink-3); }
        .fval { font-size: 16px; font-weight: 800; line-height: 1.25;
          overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .flink { flex: 0 0 auto; min-height: 44px; padding: 0 12px; border: 1px solid var(--line);
          border-radius: 12px; background: var(--card); color: var(--brand-deep); font-size: 13px; font-weight: 800; }
        .wrap[data-theme="dark"] .flink { color: var(--brand); }

        /* Nuqtalar — katta tugmalar (qidiruvsiz) */
        .pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 8px; margin-top: 8px; }
        .pbtn { position: relative; min-height: 58px; display: flex; align-items: center; justify-content: center; gap: 6px;
          text-align: center; padding: 10px 12px; border: 1.5px solid var(--line); background: var(--card); color: inherit;
          border-radius: 16px; font-size: 14.5px; font-weight: 700; line-height: 1.25; box-shadow: var(--shadow);
          overflow-wrap: anywhere; hyphens: auto;
          transition: transform .12s, border-color .15s, background .15s; }
        .pbtn:active { transform: scale(.97); }
        .pbtn.on { border-color: var(--brand); background: var(--grad); color: #fff; box-shadow: var(--lift); }
        .hdot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); flex: 0 0 auto; }
        .pbtn.on .hdot { background: #fff; }

        /* Ekran B — yo'lda kartasi */
        .trip { position: relative; overflow: hidden; border-radius: 22px; padding: 18px; color: #fff;
          background: var(--yolda-grad); box-shadow: 0 16px 36px -16px rgba(180,83,9,.55); margin-top: 8px; }
        .tpill { display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px;
          background: rgba(255,255,255,.2); border-radius: 999px; padding: 4px 11px; }
        .troute { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-top: 12px; }
        /* opacity ATAYLAB yo'q: u oq matnni gradientga aralashtirib kontrastni
           yiqitardi. Ierarxiya faqat O'LCHAM va VAZN bilan quriladi. */
        .tfrom { font-size: 20px; font-weight: 700; }
        .tarr { font-size: 20px; }
        .tto { font-size: 26px; font-weight: 800; letter-spacing: -.6px; }
        .tmeta { margin-top: 10px; font-size: 14px; font-variant-numeric: tabular-nums; }
        .tmeta b { font-weight: 800; }
        .tfoot { display: flex; gap: 8px; margin-top: 14px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.28); }
        /* Fon QORA yarim shaffof: oq fon ustida davlat raqami 12.5px da 4.5:1
           dan o'tmasdi (gradient chuqurlashtirilgandan keyin ham). */
        .tchip { font-size: 12.5px; font-weight: 700; background: rgba(0,0,0,.22); border-radius: 10px; padding: 6px 11px; }

        /* Ekran B — pastdagi asosiy tugma */
        /* Qotirilgan panellar: fon va chegara EKRAN BO'YLAB, kontent .barcol ichida
           markazda — 460px da uzilgan border-top ko'rinmasin. */
        .barcol { max-width: 460px; margin: 0 auto; }
        .bar { position: fixed; left: 0; right: 0; bottom: 0;
          padding: 12px 15px calc(12px + env(safe-area-inset-bottom));
          background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(16px);
          border-top: 1px solid var(--line); z-index: 30; }
        .big { width: 100%; min-height: 68px; border: 0; border-radius: 20px; color: #fff; font-size: 20px; font-weight: 800;
          letter-spacing: -.3px; background: var(--grad); box-shadow: var(--lift); transition: transform .12s; }
        .big:active:not(:disabled) { transform: scale(.98); }
        .big:disabled { opacity: .55; box-shadow: none; }
        /* Destruktiv "Reysni yakunlash" — asosiy tugmadan CHIZIQ va BO'SHLIQ
           bilan ajratilgan (avval 8px narida, bir xil kulrang edi). */
        .dangrow { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--line); }
        .link { display: block; width: 100%; min-height: 44px; border: 0; background: transparent; color: var(--ink-3);
          font-size: 14px; font-weight: 700; padding: 9px; border-radius: 14px; }
        .link:disabled { opacity: .5; }
        .link.dang { color: var(--xato-c);
          border: 1.5px solid color-mix(in srgb, var(--xato-c) 35%, transparent); }
        .link.dang.armed { background: var(--xato-soft);
          border-color: var(--xato-c); font-weight: 800; }

        /* Ekran C */
        .arrived { display: flex; align-items: center; gap: 13px; background: var(--card); border: 1.5px solid var(--brand);
          border-radius: 20px; padding: 15px; box-shadow: var(--shadow); margin-top: 8px; }
        .aic { width: 50px; height: 50px; flex: 0 0 auto; display: grid; place-items: center; font-size: 24px;
          border-radius: 16px; background: var(--brand-soft); }
        .atxt { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .atxt b { font-size: 16px; font-weight: 800; letter-spacing: -.2px; }
        .atxt small { font-size: 13px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
        .arefresh { width: 44px; height: 44px; flex: 0 0 auto; border: 1px solid var(--line); border-radius: 14px;
          background: var(--card-2); color: var(--ink-2); font-size: 19px; font-weight: 700; }
        .arefresh:disabled { opacity: .5; }
        /* O'tilgan yo'l zanjiri */
        .yol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-top: 10px; padding: 0 4px;
          font-size: 13px; line-height: 1.6; }
        .yotgan { color: var(--ink-3); font-weight: 600; }
        .yozor { color: var(--ink-1); font-weight: 800; }
        .yoarr { color: var(--ink-3); margin: 0 5px; }
        /* Faqat destruktiv tugma — "Yangilash" kartaga ko'chirildi, chunki
           yonma-yon turganda ikkisi piksel-bir xil ko'rinardi. */
        .cfoot { margin-top: 20px; }

        /* Yuk paneli — chipning o'zi jo'natadi */
        .yukbar { position: fixed; left: 0; right: 0; bottom: 0;
          padding: 12px 15px calc(12px + env(safe-area-inset-bottom));
          background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(18px);
          border-top: 1px solid var(--line); border-radius: 22px 22px 0 0; z-index: 30;
          box-shadow: 0 -14px 34px -18px rgba(8,30,20,.4); animation: up .22s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes up { from { transform: translateY(102%); } to { transform: none; } }
        .yhead { display: flex; align-items: center; gap: 10px; }
        .yhead b { flex: 1; font-size: 15.5px; font-weight: 800; letter-spacing: -.2px; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap; }
        .ybek { width: 44px; height: 44px; flex: 0 0 auto; border: 1px solid var(--line); background: var(--card-2);
          color: var(--ink-2); border-radius: 13px; font-size: 17px; font-weight: 700; }
        .yhint { font-size: 13px; font-weight: 600; color: var(--ink-3); margin: 5px 0 10px; }
        /* 5 daraja: bo'sh · ¼ · ½ · ¾ · to'la — YUKLAR bilan bir xil bo'lsin */
        .ychips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
        .ychip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
          min-height: 76px; border: 1.5px solid var(--line); background: var(--card); color: inherit; border-radius: 17px;
          padding: 10px 4px; box-shadow: var(--shadow); transition: transform .12s, border-color .15s; }
        .ychip:active:not(:disabled) { transform: scale(.94); border-color: var(--brand); }
        .ychip:disabled { opacity: .5; }
        .ybar { width: 22px; height: 26px; border: 1.5px solid var(--ink-2); border-radius: 5px; overflow: hidden;
          display: flex; align-items: flex-end; }
        .ybar i { display: block; width: 100%; background: var(--grad); }
        .ylbl { font-size: 13px; font-weight: 800; }

        /* Yakun */
        .finish { text-align: center; padding: 76px 20px; animation: rise .4s cubic-bezier(.2,.7,.2,1) both; }
        .fic { font-size: 58px; margin-bottom: 10px; }
        .finish h2 { margin: 0 0 6px; font-size: 23px; letter-spacing: -.4px; }
        @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        /* Ruxsat yo'q */
        .card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 28px 18px; box-shadow: var(--shadow); }
        .lockic { width: 64px; height: 64px; margin: 0 auto 12px; display: grid; place-items: center; font-size: 28px;
          border-radius: 20px; background: color-mix(in srgb, var(--ink-3) 12%, transparent); }
        h2 { margin: 4px 0 6px; font-size: 20px; letter-spacing: -.4px; }
        .idbox { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; min-height: 56px;
          color: var(--brand-deep); background: var(--brand-soft);
          border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
          border-radius: 14px; padding: 9px 18px; margin: 6px 0 10px; }
        .idnum { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 800; user-select: all; }
        .idc { font-size: 11.5px; font-weight: 700; opacity: .85; }
        .wrap[data-theme="dark"] .idbox { color: var(--brand); }

        @media (prefers-reduced-motion: reduce) {
          .yukbar, .finish, .xato { animation: none; }
          .vcard, .pbtn, .big, .ychip { transition: none; }
        }
      `}</style>
    </div>
  );
}
