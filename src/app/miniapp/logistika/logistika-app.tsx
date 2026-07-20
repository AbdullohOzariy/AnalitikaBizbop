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
  } | null;
  vehicles: Vehicle[];
  points: Point[];
  oxirgiVehicleId: number | null;
  bugun: { reys: number; plecho: number };
};

/** Hub bo'lmagan nuqtaga yetib kelgan holat — reys ochiq, lekin ochiq plecho yo'q. */
type Kelish = { tripId: number; pointId: number; pointName: string; vaqt: number };

/**
 * "expired" — 401 MUVAFFAQIYATLI yuklanishdan KEYIN kelgan holat. Sabab odatda
 * initData muddati (verifyInitData maxAge = 1 soat): uzoq yo'nalishda haydovchi
 * ilovani ochiq qoldirib 1+ soat yursa, "Yetib bordim" 401 oladi. Bu RUXSAT
 * muammosi EMAS — "ID ni nazoratchiga yuboring" ekrani bu yerda yolg'on yo'l
 * ko'rsatardi, to'g'ri yechim — ilovani qayta ochish (initData yangilanadi).
 */
type Faza = "loading" | "denied" | "expired" | "app";

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

/** Niyat uchun barqaror UUID: bor bo'lsa qayta ishlatiladi (takror yozuvni to'sadi). */
function ceidOl(aksiya: string): string {
  const k = `${CEID_KEY}:${aksiya}`;
  const bor = ls.get(k);
  if (bor) return bor;
  const yangi =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  ls.set(k, yangi);
  return yangi;
}
const ceidTozala = (aksiya: string) => ls.del(`${CEID_KEY}:${aksiya}`);

async function post<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Partial<T> & { xato?: string; ok?: boolean } }> {
  const tg = window.Telegram?.WebApp;
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-init-data": tg?.initData ?? "" },
    body: JSON.stringify(body),
  });
  let data: Partial<T> & { xato?: string; ok?: boolean } = {};
  try {
    data = (await res.json()) as Partial<T> & { xato?: string; ok?: boolean };
  } catch { /* JSON emas (502/HTML) — bo'sh obyekt bilan davom etamiz */ }
  return { status: res.status, data };
}

const haptic = {
  tanla: () => window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(),
  bos: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"),
  ok: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),
  xato: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),
};

/** Bot API 8.0 LocationManager — global TgWebApp tipida yo'q, shu yerda kengaytiriladi. */
type TgLoc = { latitude?: number; longitude?: number } | null | undefined;
type TgExt = {
  isVersionAtLeast?: (v: string) => boolean;
  LocationManager?: {
    isInited?: boolean;
    isLocationAvailable?: boolean;
    init: (cb?: () => void) => void;
    getLocation: (cb: (loc: TgLoc) => void) => void;
  };
};
const tgExt = (): TgExt | undefined => window.Telegram?.WebApp as unknown as TgExt | undefined;

/**
 * GPS olishga urinish — HECH QACHON rad etmaydi va 3 soniyadan ortiq kutmaydi.
 * Muvaffaqiyatsiz bo'lsa {} qaytadi va so'rov koordinatasiz ketaveradi.
 */
function gpsOl(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    let tugadi = false;
    const tugat = (v: { lat?: number; lng?: number }) => {
      if (tugadi) return;
      tugadi = true;
      clearTimeout(timer); // timer shu paytga qadar albatta tayinlangan (callback async)
      resolve(v);
    };
    const timer = setTimeout(() => tugat({}), 3000);
    try {
      const tg = tgExt();
      const lm = tg?.LocationManager;
      if (!lm || !tg?.isVersionAtLeast?.("8.0")) return tugat({});
      const olish = () =>
        lm.getLocation((loc) =>
          tugat(
            loc && typeof loc.latitude === "number" && typeof loc.longitude === "number"
              ? { lat: loc.latitude, lng: loc.longitude }
              : {},
          ),
        );
      if (lm.isInited) olish();
      else lm.init(() => olish());
    } catch {
      tugat({});
    }
  });
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

// ─── Asosiy komponent ─────────────────────────────────────────────────────────

export function LogistikaApp() {
  const [faza, setFaza] = useState<Faza>("loading");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tgId, setTgId] = useState<number | null>(null);

  const [holat, setHolat] = useState<HolatRes | null>(null);
  const [kelish, setKelish] = useState<Kelish | null>(null);
  const [yakun, setYakun] = useState(false);
  const [xato, setXato] = useState("");
  const [pending, setPending] = useState(false);

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
   * Holatni serverdan olish. birinchi=true bo'lsa localStorage'dagi "kelish" tiklanadi.
   *
   * useCallback([]) — faqat barqaror setter'lar va ref'lar ishlatiladi, shu sababli
   * mount effekti uni haqiqiy bog'liqlik sifatida ko'rsata oladi (lint jim, lekin
   * bog'liqlik ro'yxati YOLG'ON emas).
   */
  const yukla = useCallback(async (birinchi = false) => {
    const { status, data } = await post<HolatRes>("/api/logistika/holat", {});
    if (status === 401) { ruxsatsiz(); return; }
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
    tg?.onEvent?.("themeChanged", () => setTheme(tg?.colorScheme ?? "light"));
    (async () => {
      setTheme(tg?.colorScheme ?? "light");
      setTgId(tg?.initDataUnsafe?.user?.id ?? null);
      try {
        await yukla(true);
      } catch {
        setFaza("denied");
      }
    })();
    return () => { if (yakunTimer.current) clearTimeout(yakunTimer.current); };
  }, [yukla]);

  /** Reys yakunlandi bayrog'i — 2 soniyadan keyin bosh ekran. */
  const yakunKorsat = () => {
    setYakun(true);
    if (yakunTimer.current) clearTimeout(yakunTimer.current); // qayta chaqirilsa eskisi qolmasin
    yakunTimer.current = setTimeout(() => {
      setYakun(false);
      setToId(null);
      void yukla().catch(() => setXato(TARMOQ_XATO));
    }, 2000);
  };

  /** Barcha aksiyalar uchun umumiy qobiq: pending, GPS, ceid, xato, haptic. */
  const yubor = async (
    aksiya: string,
    path: string,
    payload: (ceid: string, gps: { lat?: number; lng?: number }, clientAt: string) => Record<string, unknown>,
    gpsKerak: boolean,
    muvaffaq: (data: Record<string, unknown>) => Promise<void> | void,
  ) => {
    if (pending) return;
    setPending(true);
    setXato("");
    haptic.bos();
    const clientAt = new Date().toISOString(); // bosilgan payt — GPS kutishidan OLDIN
    const ceid = ceidOl(aksiya);
    try {
      const gps = gpsKerak ? await gpsOl() : {};
      const { status, data } = await post<Record<string, unknown>>(path, payload(ceid, gps, clientAt));
      ceidTozala(aksiya); // javob keldi — natija ma'lum, niyat yopildi
      if (status === 401) { ruxsatsiz(); return; }
      if (status !== 200 || data.ok === false) {
        haptic.xato();
        setXato(data.xato ?? "Xatolik yuz berdi");
        return;
      }
      haptic.ok();
      await muvaffaq(data as Record<string, unknown>);
    } catch {
      // Tarmoq uzildi — natija NOMA'LUM, ceid saqlanib qoladi (qayta bosish xavfsiz).
      haptic.xato();
      setXato(TARMOQ_XATO);
    } finally {
      setPending(false);
    }
  };

  const yolgaChiq = (load: Load) => {
    if (vehicleId == null || fromId == null || toId == null) return;
    return yubor(
      "yolga",
      "/api/logistika/yolga-chiqdim",
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
    return yubor(
      "yakun",
      "/api/logistika/reysni-yakunla",
      (clientEventId) => ({ clientEventId, tripId }),
      false,
      async () => {
        setKelish(null);
        ls.del(KELISH_KEY);
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
    setXato("");
    setToId(null);
    void yukla().catch(() => setXato(TARMOQ_XATO));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (faza === "loading") {
    return (
      <Qobiq theme={theme}>
        <div className="center">
          <div className="spin" />
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

  if (faza === "denied" || !holat) {
    return (
      <Qobiq theme={theme}>
        <div className="card center" style={{ marginTop: 28 }}>
          <div className="lockic">🔒</div>
          <h2>Ruxsat yo&apos;q</h2>
          {tgId != null && <p className="idbox">🆔 {tgId}</p>}
          <p className="muted">Bu ID ni logistika nazoratchisiga yuboring.</p>
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
        <small>{holat.bugun.reys} reys · {holat.bugun.plecho} plecho</small>
      </header>

      {xato && (
        <div className="xato">
          <span className="xic">⚠️</span>
          <span>{xato}</span>
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
}) {
  const { holat, vehicleId, setVehicleId, fromId, setFromId, toId, setToId, fromOchiq, setFromOchiq, pending, onYuk } = props;

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
            disabled={v.band}
            onClick={() => { haptic.tanla(); setVehicleId(v.id); }}
          >
            <span className="vic">🚚</span>
            <span className="vtxt">
              <b>{v.plateNumber}</b>
              <small>{v.band ? `${v.bandKim ?? "Boshqa haydovchi"} yo'lda` : v.brand}</small>
            </span>
            {v.id === vehicleId && !v.band && <span className="tick">✓</span>}
          </button>
        ))}
        {avtolar.length === 0 && <p className="muted">Moshina ro&apos;yxati bo&apos;sh.</p>}
        {bandHammasi && (
          <p className="muted">Barcha moshinalar yo&apos;lda — bo&apos;shaganda yo&apos;lga chiqa olasiz.</p>
        )}
      </div>

      <div className="fromrow">
        <span className="flbl">Qayerdan</span>
        <b className="fval">{fromName}</b>
        <button className="flink" onClick={() => setFromOchiq(!fromOchiq)}>
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
          <button className="link" disabled={pending} onClick={onYakunla}>
            Reysni yakunlash
          </button>
        </div>
      </div>
    </>
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

  return (
    <>
      <div className="arrived">
        <div className="aic">📍</div>
        <div className="atxt">
          <b>{kelish.pointName} ga yetib bordingiz</b>
          <small>{soat(new Date(kelish.vaqt).toISOString())} · yozib olindi</small>
        </div>
      </div>

      <h3 className="sec">Keyingi yo&apos;nalish</h3>
      <NuqtaGrid
        nuqtalar={nuqtalar.filter((p) => p.id !== kelish.pointId)}
        tanlangan={toId}
        onTanla={(id) => { haptic.tanla(); setToId(id === toId ? null : id); }}
      />

      <div className="cfoot">
        <button className="link" disabled={pending} onClick={onYakunla}>Reysni yakunlash</button>
        <button className="link ghost" disabled={pending} onClick={onYangila}>Yangilash</button>
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

function NuqtaGrid({ nuqtalar, tanlangan, onTanla }: {
  nuqtalar: Point[]; tanlangan: number | null; onTanla: (id: number) => void;
}) {
  return (
    <div className="pgrid">
      {nuqtalar.map((p) => (
        <button
          key={p.id}
          className={`pbtn ${p.id === tanlangan ? "on" : ""} ${p.isHub ? "hub" : ""}`}
          onClick={() => onTanla(p.id)}
        >
          {p.isHub && <span className="hdot" />}
          {p.name}
        </button>
      ))}
      {nuqtalar.length === 0 && <p className="muted">Nuqta yo&apos;q.</p>}
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
          <button className="ybek" onClick={onBekor} aria-label="Bekor qilish">✕</button>
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
          --ink-3: var(--tg-hint);
          --line:   color-mix(in srgb, var(--tg-hint) 22%, transparent);
          --line-2: color-mix(in srgb, var(--tg-hint) 12%, transparent);

          --brand: #10B981; --brand-2: #059669; --brand-deep: #047857;
          --brand-soft: color-mix(in srgb, var(--brand) 14%, transparent);
          --grad: linear-gradient(152deg, #12B67F 0%, #0A8A63 52%, #065F46 100%);
          --yolda: #F59E0B; --yolda-soft: color-mix(in srgb, #F59E0B 15%, transparent);
          --yolda-grad: linear-gradient(152deg, #F7A32B 0%, #E07C05 55%, #B45309 100%);
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

        .brandbar { display: flex; align-items: center; gap: 9px; padding: 14px 2px 10px; }
        .branddot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft); }
        .brandbar b { font-size: 16px; font-weight: 800; letter-spacing: -.3px; }
        .brandbar small { margin-left: auto; font-size: 11.5px; font-weight: 700; color: var(--ink-3);
          background: var(--card-2); border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; }

        .muted { color: var(--ink-3); font-size: 13px; line-height: 1.5; }
        .center { text-align: center; padding: 48px 16px; }
        .spin { width: 30px; height: 30px; margin: 0 auto 12px; border-radius: 50%;
          border: 3px solid var(--line); border-top-color: var(--brand); animation: sp .8s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }

        .sec { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px;
          color: var(--ink-3); margin: 16px 2px 8px; }

        /* Xato — KATTA va ko'zga tashlanadigan (409: "band moshina") */
        .xato { display: flex; align-items: flex-start; gap: 10px; background: var(--xato-soft);
          border: 1.5px solid color-mix(in srgb, var(--xato-c) 40%, transparent); border-radius: 16px;
          padding: 14px 15px; margin: 4px 0 12px; color: var(--xato-c); font-size: 15px; font-weight: 700; line-height: 1.4;
          animation: shake .3s ease; }
        .xic { font-size: 19px; line-height: 1.1; }
        @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }

        /* Moshina ro'yxati */
        .vlist { display: flex; flex-direction: column; gap: 8px; }
        .vcard { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 62px; text-align: left;
          background: var(--card); border: 1.5px solid var(--line); border-radius: 18px; padding: 10px 14px; color: inherit;
          box-shadow: var(--shadow); transition: transform .12s, border-color .15s, background .15s; }
        .vcard:active:not(:disabled) { transform: scale(.98); }
        .vcard.on { border-color: var(--brand); background: var(--brand-soft); }
        .vcard.band { opacity: .5; filter: grayscale(1); box-shadow: none; cursor: not-allowed; }
        .vic { font-size: 22px; }
        .vtxt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .vtxt b { font-size: 16px; font-weight: 800; letter-spacing: .3px; }
        .vtxt small { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tick { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto;
          background: var(--grad); color: #fff; font-size: 14px; font-weight: 800; }

        /* Qayerdan */
        .fromrow { display: flex; align-items: center; gap: 9px; margin: 14px 0 0; padding: 12px 14px;
          background: var(--card-2); border: 1px solid var(--line); border-radius: 16px; }
        .flbl { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: var(--ink-3); }
        .fval { flex: 1; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .flink { border: 0; background: transparent; color: var(--brand-deep); font-size: 13px; font-weight: 800; padding: 4px; }
        .wrap[data-theme="dark"] .flink { color: var(--brand); }

        /* Nuqtalar — katta tugmalar (qidiruvsiz) */
        .pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 8px; margin-top: 8px; }
        .pbtn { position: relative; min-height: 58px; display: flex; align-items: center; justify-content: center; gap: 6px;
          text-align: center; padding: 10px 12px; border: 1.5px solid var(--line); background: var(--card); color: inherit;
          border-radius: 16px; font-size: 14.5px; font-weight: 700; line-height: 1.25; box-shadow: var(--shadow);
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
        .tfrom { font-size: 20px; font-weight: 700; opacity: .82; }
        .tarr { font-size: 20px; opacity: .7; }
        .tto { font-size: 26px; font-weight: 800; letter-spacing: -.6px; }
        .tmeta { margin-top: 10px; font-size: 14px; color: rgba(255,255,255,.9); font-variant-numeric: tabular-nums; }
        .tmeta b { font-weight: 800; }
        .tfoot { display: flex; gap: 8px; margin-top: 14px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.18); }
        .tchip { font-size: 12.5px; font-weight: 700; background: rgba(255,255,255,.18); border-radius: 10px; padding: 6px 11px; }

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
        .link { display: block; width: 100%; margin-top: 8px; border: 0; background: transparent; color: var(--ink-3);
          font-size: 13.5px; font-weight: 700; padding: 9px; }
        .link:disabled { opacity: .5; }

        /* Ekran C */
        .arrived { display: flex; align-items: center; gap: 13px; background: var(--card); border: 1.5px solid var(--brand);
          border-radius: 20px; padding: 15px; box-shadow: var(--shadow); margin-top: 8px; }
        .aic { width: 50px; height: 50px; flex: 0 0 auto; display: grid; place-items: center; font-size: 24px;
          border-radius: 16px; background: var(--brand-soft); }
        .atxt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .atxt b { font-size: 16px; font-weight: 800; letter-spacing: -.2px; }
        .atxt small { font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
        .cfoot { display: flex; gap: 8px; margin-top: 16px; }
        .cfoot .link { margin-top: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--card-2); }
        .link.ghost { color: var(--ink-3); }

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
        .ybek { width: 34px; height: 34px; flex: 0 0 auto; border: 1px solid var(--line); background: var(--card-2);
          color: var(--ink-2); border-radius: 11px; font-size: 15px; font-weight: 700; }
        .yhint { font-size: 12px; font-weight: 600; color: var(--ink-3); margin: 4px 0 10px; }
        /* 5 daraja: bo'sh · ¼ · ½ · ¾ · to'la — YUKLAR bilan bir xil bo'lsin */
        .ychips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
        .ychip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
          min-height: 76px; border: 1.5px solid var(--line); background: var(--card); color: inherit; border-radius: 17px;
          padding: 10px 4px; box-shadow: var(--shadow); transition: transform .12s, border-color .15s; }
        .ychip:active:not(:disabled) { transform: scale(.94); border-color: var(--brand); }
        .ychip:disabled { opacity: .5; }
        .ybar { width: 22px; height: 26px; border: 1.5px solid var(--ink-3); border-radius: 5px; overflow: hidden;
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
        .idbox { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 800; color: var(--brand-deep);
          background: var(--brand-soft); border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
          border-radius: 12px; padding: 9px 16px; display: inline-block; margin: 6px 0 10px; user-select: all; }
        .wrap[data-theme="dark"] .idbox { color: var(--brand); }

        @media (prefers-reduced-motion: reduce) {
          .yukbar, .finish, .xato { animation: none; }
          .vcard, .pbtn, .big, .ychip { transition: none; }
        }
      `}</style>
    </div>
  );
}
