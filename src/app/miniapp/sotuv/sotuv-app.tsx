"use client";

/**
 * BizbopSotuv Mini App — 2 tab:
 *   Hisobot — gradient "pul kartasi" (savdo + KPI), reja arc-gauge, filiallar
 *   leaderboard, marja; Inventar — SKU sanash (progress, chap-accent kartalar).
 * Dizayn: Designer spec (Revolut/TON-apps naqshlari) — brend emerald, TG tema.
 * Auth: Telegram initData ("x-telegram-init-data" header) → /api/miniapp-sotuv/me.
 * Window.Telegram global tipi sverka-app.tsx da e'lon qilingan (declare global).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isoDay, todayTashkentISO } from "@/lib/date";
import { formatUZS, formatNumber, formatQty, formatDateUZ } from "@/lib/format";
import { marjaTone, type MarjaTone } from "@/lib/marja";

type MeUser = {
  name: string;
  roles: string[];
  canInventory: boolean;
  branches: { id: number; name: string }[];
};
type DashData = {
  kpi: { sales: number; receipts: number; avgReceipt: number };
  branches: { id: number; name: string; sales: number; receipts: number; share: number }[];
  marja: { name: string; marja: number | null; sales: number }[];
  plan: { plan: number; fakt: number; percent: number };
  lastDataDay: string | null;
  /** Kunlik savdo (davr bo'yicha, qamrov yig'indisi) — hero sparkline uchun. */
  series?: number[];
};
type InvItem = {
  productId: number;
  code: number;
  name: string;
  systemQty: number;
  countedQty: number | null;
  note: string | null;
};

type Davr = "bugun" | "hafta" | "oy";
const DAVRLAR: { key: Davr; label: string }[] = [
  { key: "bugun", label: "Bugun" },
  { key: "hafta", label: "7 kun" },
  { key: "oy", label: "Oy" },
];

function davrRange(d: Davr): { start: string; end: string } {
  const end = todayTashkentISO();
  if (d === "bugun") return { start: end, end };
  if (d === "hafta") {
    const s = new Date(end + "T00:00:00.000Z");
    s.setUTCDate(s.getUTCDate() - 6);
    return { start: isoDay(s), end };
  }
  return { start: end.slice(0, 8) + "01", end }; // oy boshidan bugungacha
}

/**
 * Xato TURI — "ruxsat yo'q" ni tarmoq/server uzilishidan ajratadi.
 * Ilgari `res.json()` `res.ok` dan OLDIN chaqirilardi: Railway redeploy yoki
 * Neon uzilishida qaytgan 502/504 HTML sahifasi SyntaxError berib, xodimga
 * "Hisobingiz ulanmagan — ID'ni adminga yuboring" ekranini ko'rsatardi. Bu
 * terminal ekran edi (qayta urinish yo'q), ya'ni vaqtinchalik uzilish doimiy
 * ruxsat muammosidek tuyulardi.
 */
type XatoTuri = "tarmoq" | "ruxsat" | "server";
class ApiXato extends Error {
  readonly turi: XatoTuri;
  constructor(message: string, turi: XatoTuri) {
    super(message);
    this.name = "ApiXato";
    this.turi = turi;
  }
}
/** Xato → foydalanuvchiga ko'rsatiladigan tur (noma'lum xato = server). */
const xatoTuri = (e: unknown): XatoTuri => (e instanceof ApiXato ? e.turi : "server");
const xatoMatn = (e: unknown, zaxira = "Xatolik yuz berdi") =>
  e instanceof Error && e.message ? e.message : zaxira;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), "x-telegram-init-data": initData },
    });
  } catch {
    // fetch reject = tarmoq (DNS/offline/uzilish) — server umuman javob bermadi
    throw new ApiXato("Internetga ulanib bo'lmadi.", "tarmoq");
  }
  // JSON'ni ixtiyoriy o'qiymiz: statusni aniqlash undan MUSTAQIL bo'lsin
  let j: (T & { xato?: string }) | null = null;
  try { j = (await res.json()) as T & { xato?: string }; } catch { /* HTML/bo'sh javob */ }
  if (!res.ok) {
    // 429 (rate-limit) ataylab "server" — u vaqtinchalik, ruxsat muammosi emas
    const turi: XatoTuri = res.status === 401 || res.status === 403 ? "ruxsat" : "server";
    throw new ApiXato(j?.xato ?? (turi === "ruxsat" ? "Ruxsat yo'q." : "Server javob bermadi."), turi);
  }
  if (j === null) throw new ApiXato("Server javobi tushunarsiz.", "server");
  return j;
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "•";

const haptic = {
  select: () => window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(),
  impact: () => window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"),
  ok: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success"),
  err: () => window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error"),
};

/** Hero raqam count-up (rAF, kutubxonasiz). reduced-motion / 0 da darrov yakuniy. */
function useCountUp(target: number, ms = 700): number {
  const [val, setVal] = useState(target);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current === target) return;
    prev.current = target;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      if (reduced || target === 0) { setVal(target); return; }
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); // setState faqat rAF callback'da (effektda sync emas)
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

// ─── Inline SVG ikonalar (currentColor — temaga mos) ─────────────────────────

const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
    <line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" />
  </svg>
);
const IconBox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8l9-4 9 4v8l-9 4-9-4V8z" /><path d="M3 8l9 4 9-4" /><path d="M12 12v8" />
  </svg>
);
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" />
  </svg>
);

export function SotuvApp() {
  /* "denied" (ruxsat yo'q — terminal) va "error" (tarmoq/server — qayta urinsa
     bo'ladi) ATAYLAB alohida: ilgari ikkalasi ham qulf ekraniga tushib, xodim
     vaqtinchalik uzilishda ham adminni bezovta qilardi. */
  const [phase, setPhase] = useState<"loading" | "denied" | "error" | "app">("loading");
  const [deniedMsg, setDeniedMsg] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<"hisobot" | "inventar">("hisobot");
  const [tgId, setTgId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [urinish, setUrinish] = useState(0);          // "Qayta urinish" hisoblagichi
  /* Hisobot yangilash: `reload` — fetch trigger, `refreshing` — faqat ikona
     holati. Kalitga (davr|filial) TEGMAYMIZ, aks holda skeleton chaqnardi. */
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const oxirgiFetch = useRef(0);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    // Ro'yxat tepasida over-scroll → sheet yopiladi → sanalgan SKU'lar yo'qoladi
    if (tg?.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes?.();
    // Tema Telegram'dan (prefers-color-scheme emas — custom temalar mos kelmaydi)
    const onTheme = () => setTheme(window.Telegram?.WebApp?.colorScheme ?? "light");
    tg?.onEvent?.("themeChanged", onTheme);
    (async () => {
      setTheme(tg?.colorScheme ?? "light");
      setTgId(tg?.initDataUnsafe?.user?.id ?? null);
      setPhase("loading");
      try {
        const r = await api<{ ok: true; user: MeUser }>("/api/miniapp-sotuv/me");
        setMe(r.user);
        setPhase("app");
      } catch (e) {
        setDeniedMsg(xatoMatn(e, "Telegram orqali oching."));
        setPhase(xatoTuri(e) === "ruxsat" ? "denied" : "error");
      }
    })();
    return () => { window.Telegram?.WebApp?.offEvent?.("themeChanged", onTheme); };
  }, [urinish]);

  /* Fonda turgan ilova eskirgan raqamlarni ko'rsatmasin. 60s — 1C yangilanish
     tezligiga nisbatan arzon. Yon foyda: yarim tundan o'tganda `davrRange()`
     qayta hisoblanadi, aks holda "Bugun" kechagi sanani so'rab turardi. */
  useEffect(() => {
    if (phase !== "app") return;   // HisobotTab mount emas — reload'ni kutib oladigan hech kim yo'q
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - oxirgiFetch.current < 60_000) return;
      setRefreshing(true);
      setReload((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  /* BARQAROR referens shart: HisobotTab fetch effektining deps'ida turadi —
     har renderda yangilansa cheksiz fetch sikli bo'lardi. */
  const refreshLoaded = useCallback(() => {
    oxirgiFetch.current = Date.now();
    setRefreshing(false);
  }, []);
  const refresh = () => {
    if (refreshing) return;
    haptic.impact();
    setRefreshing(true);
    setReload((n) => n + 1);
  };

  const copyId = () => {
    if (tgId == null) return;
    navigator.clipboard?.writeText(String(tgId)).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => {}
    );
  };

  const switchTab = (t: "hisobot" | "inventar") => { if (t !== tab) { haptic.select(); setTab(t); } };

  if (phase === "loading") {
    return <Shell theme={theme}><div className="skwrap"><div className="sk h" /><div className="sk r" /><div className="sk c" /></div></Shell>;
  }
  /* Tarmoq/server uzilishi — vaqtinchalik. Adminning ID'si bu yerda ATAYLAB
     yo'q: muammo ruxsatda emas, xodimni adashtirmaslik kerak. */
  if (phase === "error") {
    return (
      <Shell theme={theme}>
        <div className="locked">
          <div className="lockic">📡</div>
          <h2>Ulanib bo&apos;lmadi</h2>
          <p className="muted">{deniedMsg || "Aloqa yoki server vaqtincha mavjud emas."}</p>
          <button className="retry" onClick={() => setUrinish((n) => n + 1)}>↻ Qayta urinish</button>
        </div>
      </Shell>
    );
  }
  if (phase === "denied" || !me) {
    return (
      <Shell theme={theme}>
        <div className="locked">
          <div className="lockic">🔒</div>
          <h2>Hisobingiz ulanmagan</h2>
          <p className="muted">{deniedMsg || "Bu bo'lim faqat ro'yxatdan o'tgan xodimlar uchun."}</p>
          {tgId != null && (
            <>
              <button className="idbtn" onClick={copyId}>
                <span className="idnum">{tgId}</span>
                <span className="idc">{copied ? "✅ nusxa olindi" : "📋 nusxa olish"}</span>
              </button>
              <p className="muted small">Ushbu ID&apos;ni administratorga yuboring — u sizni tizimga bog&apos;laydi.</p>
            </>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell theme={theme}>
      <div className="brandbar">
        <span className="branddot" />
        <b>{tab === "hisobot" ? "BizbopSotuv" : "Inventar"}</b>
        <span className="who"><span className="avatar">{initials(me.name)}</span><span className="whon">{me.name}</span></span>
        {/* Yangilash faqat Hisobot uchun: Inventar'ni qayta yuklash sanoqni
            serverdagi holatga qaytarish xavfini tug'diradi (qoralama bor, lekin
            xodim uchun bu kutilmagan harakat bo'lardi). */}
        {tab === "hisobot" && (
          <button className="refresh" onClick={refresh} disabled={refreshing} aria-label="Yangilash"
            data-spin={refreshing ? "1" : undefined}>
            <IconRefresh />
          </button>
        )}
      </div>
      {/* Ikkala tab ham MOUNT holda qoladi: ternary bilan almashganda InventarTab
          unmount bo'lib, sanalgan miqdorlarni (faqat React state'da) jimgina
          o'chirar edi. Yashirish — CSS (.pane.off) orqali. */}
      <div className={tab === "hisobot" ? "pane" : "pane off"}>
        <HisobotTab me={me} reload={reload} onLoaded={refreshLoaded} onRetry={refresh} />
      </div>
      {me.canInventory && (
        <div className={tab === "inventar" ? "pane" : "pane off"}><InventarTab me={me} /></div>
      )}
      {me.canInventory && (
        <nav className="tabbar" aria-label="Bo'limlar">
          <div className="barcol">
            {/* aria-pressed toggle to'plami — WCAG 4.1.2 ga mos va pastki nav-bar
                uchun tabiiyroq (role="tab" roving tabindex'siz a11y'ni buzardi). */}
            <div className="tabnav" data-active={tab}>
              <button className="tabbtn" aria-pressed={tab === "hisobot"} onClick={() => switchTab("hisobot")}>
                <IconChart /> Hisobot
              </button>
              <button className="tabbtn" aria-pressed={tab === "inventar"} onClick={() => switchTab("inventar")}>
                <IconBox /> Inventar
              </button>
            </div>
          </div>
        </nav>
      )}
    </Shell>
  );
}

// ─── Hisobot ──────────────────────────────────────────────────────────────────

/** Semantik tone → miniapp palitrasi (chegaralar src/lib/marja.ts da). */
const MARJA_RANG: Record<MarjaTone, string> = {
  good: "var(--brand)",
  ok: "var(--warn)",
  bad: "var(--danger)",
  none: "var(--ink-3)",
};

function HisobotTab({ me, reload, onLoaded, onRetry }: {
  me: MeUser; reload: number; onLoaded: () => void; onRetry: () => void;
}) {
  const single = me.branches.length === 1;
  const [davr, setDavr] = useState<Davr>("bugun");
  const [branchId, setBranchId] = useState<number>(single ? me.branches[0].id : 0);
  const [res, setRes] = useState<{ key: string; data: DashData | null; err: string } | null>(null);
  /* Oxirgi MA'LUM kun — alohida holatda: `data` yuklanish paytida null bo'lgani
     uchun status qatori har davr/filial almashuvida yo'qolib-paydo bo'lardi. */
  const [oxirgiKun, setOxirgiKun] = useState<string | null>(null);
  const key = `${davr}|${branchId}`;
  const loading = res?.key !== key;
  const data = loading ? null : res?.data ?? null;
  const err = loading ? "" : res?.err ?? "";

  useEffect(() => {
    let cancelled = false;
    const k = `${davr}|${branchId}`;
    (async () => {
      try {
        // `davrRange` ATAYLAB shu yerda — har yangilashda joriy kunni oladi
        const { start, end } = davrRange(davr);
        const q = new URLSearchParams({ start, end });
        if (branchId > 0) q.set("branchId", String(branchId));
        const r = await api<{ ok: true } & DashData>(`/api/miniapp-sotuv/dashboard?${q}`);
        if (!cancelled) { setRes({ key: k, data: r, err: "" }); setOxirgiKun(r.lastDataDay); }
      } catch (e) {
        if (!cancelled) setRes({ key: k, data: null, err: xatoMatn(e) });
      } finally {
        if (!cancelled) onLoaded();   // yangilash ikonasini to'xtatish + vaqt tamg'asi
      }
    })();
    return () => { cancelled = true; };
  }, [davr, branchId, reload, onLoaded]);

  const setDavrH = (d: Davr) => { if (d !== davr) { haptic.select(); setDavr(d); } };
  const davrLabel = DAVRLAR.find((d) => d.key === davr)?.label.toLowerCase() ?? "";
  const isZero = !!data && data.kpi.sales === 0 && data.kpi.receipts === 0;
  const sorted = data ? [...data.branches].sort((a, b) => b.sales - a.sales) : [];
  const maxBranch = Math.max(1, ...sorted.map((b) => b.sales));
  /* lastDataDay — ProductSales'ning GLOBAL oxirgi kuni (filial filtri yo'q, kun
     chegarasi — soat emas). 1C kechikkanda yig'indi to'liq ko'rinib qolmasin.
     `data` emas, `oxirgiKun` dan: yuklanish paytida ham qator joyida qoladi. */
  const eskiKun = oxirgiKun && oxirgiKun < todayTashkentISO() ? oxirgiKun : null;

  return (
    <>
      {eskiKun && (
        <p className="datastat">
          <span className="dot" />Savdo ma&apos;lumoti {formatDateUZ(eskiKun)} gacha
        </p>
      )}

      {/* Davr — FILTR (tab emas): shuning uchun aria-pressed, role="tab" emas */}
      <div className="seg">
        {DAVRLAR.map((d) => (
          <button key={d.key} className={davr === d.key ? "on" : ""} aria-pressed={davr === d.key}
            onClick={() => setDavrH(d.key)}>{d.label}</button>
        ))}
      </div>

      {!single && (
        <div className="selrow">
          <select className="sel" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
            {me.branches.length > 1 && <option value={0}>Jami · barcha filiallar</option>}
            {me.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {err && <p className="err">{err} <button className="inretry" onClick={onRetry}>↻ Qayta urinish</button></p>}
      {loading && <div className="skwrap"><div className="sk h" /><div className="sk r" /><div className="sk c" /></div>}

      {!loading && data && isZero && (
        <>
          <div className="hero zero">
            <div className="ic">☀️</div>
            <div className="t">{davr === "bugun" ? "Bugun savdo hali boshlanmadi" : "Bu davrda savdo topilmadi"}</div>
            {/* Sanani takrorlamaymiz — u yuqoridagi doimiy `.datastat` qatorida turadi */}
            <div className="s">
              {data.lastDataDay
                ? (davr === "bugun" ? "7 kun yoki Oy'ni tanlang." : "Boshqa davrni tanlang.")
                : "Ma'lumot 1C'dan yangilanadi."}
            </div>
          </div>
          {data.plan.plan > 0 && (
            <div className="card">
              <div className="chead"><b>Davr rejasi</b><span className="pct muted-c">{formatUZS(data.plan.plan, { compact: true })}</span></div>
            </div>
          )}
        </>
      )}

      {!loading && data && !isZero && (
        <>
          <HeroCard sales={data.kpi.sales} receipts={data.kpi.receipts} avgReceipt={data.kpi.avgReceipt}
            davrLabel={davrLabel} series={davr === "bugun" ? [] : data.series ?? []} />

          <div className="card">
            <div className="chead"><b>Reja bajarilishi</b></div>
            {data.plan.plan > 0 ? (
              <div className="plancard">
                <Gauge percent={data.plan.percent} />
                <div className="planside">
                  <div className="prow"><span className="k">Fakt</span><span className="v">{formatUZS(data.plan.fakt, { compact: true })}</span></div>
                  <div className="prow"><span className="k">Reja</span><span className="v">{formatUZS(data.plan.plan, { compact: true })}</span></div>
                  <span className={`planchip ${data.plan.percent >= 100 ? "good" : "warn"}`}>
                    {data.plan.percent >= 100 ? `+${(data.plan.percent - 100).toFixed(1)}% oshirildi` : `${(100 - data.plan.percent).toFixed(1)}% qoldi`}
                  </span>
                </div>
              </div>
            ) : (
              <p className="muted">Bu davr uchun reja belgilanmagan.</p>
            )}
          </div>

          {sorted.length > 1 && (
            <div className="card">
              <div className="chead"><b>Filiallar kesimi</b><span className="pct muted-c">{sorted.length} ta</span></div>
              {/* Ikki qator: yuqorida nom/summa, pastda progress+ulush. Ilgari
                  bitta 3-ustunli grid edi va `.sh` (grid-column:3) `.track`
                  (2/-1) bilan to'qnashib 3-qatorga tushardi. */}
              {sorted.map((b, i) => (
                <div key={b.id} className={`brow ${i === 0 ? "lead" : ""}`}>
                  <div className="btop">
                    <span className="brank">{i + 1}</span>
                    <span className="bn">{b.name}</span>
                    <span className="bv">{formatUZS(b.sales, { compact: true })}</span>
                  </div>
                  <div className="bbot">
                    <div className="track"><i style={{ width: `${Math.max(4, (b.sales / maxBranch) * 100)}%` }} /></div>
                    <span className="sh">{b.share.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="chead"><b>Marja · guruhlar</b></div>
            {data.marja.length === 0 && <p className="muted">Ma&apos;lumot yo&apos;q</p>}
            {data.marja.map((m) => {
              const col = MARJA_RANG[marjaTone(m.marja)];
              return (
                <div key={m.name} className="mrow">
                  <span className="mdot" style={{ background: col }} />
                  <span className="mn">{m.name}</span>
                  <span className="mv">{formatUZS(m.sales, { compact: true })}</span>
                  <span className="mm" style={{ color: col }}>{m.marja == null ? "—" : `${m.marja.toFixed(1)}%`}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** Gradient "pul kartasi" — savdo + 2 KPI (Revolut balans patterni). */
function HeroCard({ sales, receipts, avgReceipt, davrLabel, series }: {
  sales: number; receipts: number; avgReceipt: number; davrLabel: string; series: number[];
}) {
  const animated = useCountUp(sales);
  return (
    <div className="hero">
      <div className="eyebrow">Savdo · {davrLabel}</div>
      {/* compact FAQAT shu qatorda qoladi — u useCountUp rAF animatsiyasi bilan
          juftlangan (to'liq qiymat har kadrda titrardi). Birlik alohida span:
          eyebrow'da "SO'M" uppercase apostrof bilan xunuk chiqadi. */}
      <div className="val">{formatUZS(animated, { compact: true })}<span className="unit">so&apos;m</span></div>
      <Sparkline points={series} />
      <div className="sub">
        <div><div className="k">Cheklar</div><div className="n">{formatNumber(receipts)}</div></div>
        {/* O'rtacha chek — TO'LIQ: u animatsiyalanmaydi va "1,2 mln" ko'rinishi
            chek summasi uchun juda dag'al (qo'shni `receipts` ham to'liq). */}
        <div><div className="k">O&apos;rtacha chek</div><div className="n">{formatUZS(avgReceipt)}</div></div>
      </div>
    </div>
  );
}

/**
 * Kunlik savdo mikro-grafigi. ATAYLAB faqat 2+ kunli davrlarda: "Bugun" da
 * bitta nuqta bo'ladi, ustiga 1C kechikishi tufayli to'liq bo'lmagan bugun
 * to'liq kecha bilan yonma-yon turib soxta pasayish taassurotini berardi.
 */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const W = 100, H = 26;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((v - min) / span) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  // Matn muqobili: trend faqat vizual edi — skrinrider foydalanuvchisi uchun
  // yo'nalish + chegaralar so'z bilan. `aria-hidden` o'rniga role="img".
  const oxirgi = points[points.length - 1];
  const yonalish = oxirgi > points[0] ? "o'sish" : oxirgi < points[0] ? "pasayish" : "o'zgarishsiz";
  const label = `Kunlik savdo grafigi, ${points.length} kun: ${yonalish}. `
    + `Eng yuqori ${formatUZS(max)}, eng past ${formatUZS(min)} so'm.`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="rgba(255,255,255,.14)" stroke="none" />
      <path d={d} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Sof-SVG arc gauge — 270° yoy, markazda %. */
function Gauge({ percent }: { percent: number }) {
  const C = 289.03, ARC = 216.77; // 2π·46 ; 0.75·C
  const pct = Math.min(100, Math.max(0, percent));
  const off = ARC * (1 - pct / 100);
  /* Uch pog'ona: 85% dan past — haqiqiy ogohlantirish, 85-100% — deyarli reja.
     `--ortiqcha` (inventar semantikasi: "ortiqcha qoldiq") ATAYLAB ishlatilmadi
     — bu yerda ma'no boshqa, bir token ikki ma'noda chalkashtiradi. */
  const col = percent >= 100 ? "var(--brand)" : percent >= 85 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="gauge">
      <svg viewBox="0 0 104 104" aria-hidden>
        <g transform="rotate(135 52 52)">
          <circle cx="52" cy="52" r="46" fill="none" stroke="var(--line)" strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${ARC} ${C}`} />
          <circle cx="52" cy="52" r="46" fill="none" stroke={col} strokeWidth="10"
            strokeLinecap="round" strokeDasharray={`${ARC} ${C}`} strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset .8s cubic-bezier(.3,.8,.3,1)" }} />
        </g>
      </svg>
      <div className="center">
        <div>
          <div className="pctv">{percent.toFixed(0)}%</div>
          <div className="pctl">reja</div>
        </div>
      </div>
    </div>
  );
}

// ─── Inventar ─────────────────────────────────────────────────────────────────

type EditVal = { qty: string; note: string };

/* Qoralama: sanoqlar faqat React state'da bo'lgani uchun sheet yopilishi/qayta
   yuklanish oxirgi saqlashdan keyingi kiritishlarni yo'q qilardi. Kalitga kun
   kiritilgan — ertangi sanoq kechagi qoralamani tiklab olmasin. */
const DRAFT_PREFIX = "inv:";
const draftKey = (branchId: number) => `${DRAFT_PREFIX}${branchId}:${todayTashkentISO()}`;

const ls = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

/** Boshqa kunlarning qoralamalari — localStorage cheksiz o'smasin. */
function eskiQoralamalarniTozala() {
  const bugun = `:${todayTashkentISO()}`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX) && !k.endsWith(bugun)) localStorage.removeItem(k);
    }
  } catch { /* private mode */ }
}

function InventarTab({ me }: { me: MeUser }) {
  const [branchId, setBranchId] = useState<number>(me.branches[0]?.id ?? 0);
  const [res, setRes] = useState<{ branchId: number; items: InvItem[]; err: string } | null>(null);
  const [vals, setVals] = useState<Record<number, EditVal>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [dirty, setDirty] = useState(false);      // saqlanmagan kiritish bormi
  const [restored, setRestored] = useState(false); // qoralama tiklandimi
  /* Qayta yuklash hisoblagichi. Busiz BITTA filialli xodim uchun ro'yxat
     yuklanmasa boshi berk ko'cha edi: effekt deps'i faqat [branchId], u esa
     hech qachon o'zgarmaydi — appni yopib-ochishdan boshqa yo'l yo'q. */
  const [qayta, setQayta] = useState(0);
  /* `vals` QAYSI filialning sanoqlari (null — hech qaysi/yuklanmoqda). Kalitsiz
     yozuv xavfli: productId'lar filiallar aro umumiy (katalog bitta), shuning
     uchun A ning sanoqlari B ning qoralamasiga tushib, soxta sanoq saqlanardi. */
  const valsBranch = useRef<number | null>(null);
  /* Tahrir hisoblagichi — save() ketayotganda kiritilgan qiymat o'chib qolmasin. */
  const editSeq = useRef(0);

  const loading = res?.branchId !== branchId;
  const items = loading ? [] : res?.items ?? [];
  const loadErr = loading ? "" : res?.err ?? "";

  useEffect(() => { eskiQoralamalarniTozala(); }, []);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ ok: true; sanaKuni: string; items: InvItem[] }>(`/api/miniapp-sotuv/inventar?branchId=${branchId}`);
        if (cancelled) return;
        const v: Record<number, EditVal> = {};
        for (const it of r.items) {
          v[it.productId] = { qty: it.countedQty == null ? "" : String(it.countedQty), note: it.note ?? "" };
        }
        // Qoralama serverdan ustun: unda oxirgi saqlashdan keyingi kiritishlar bor
        const kalit = draftKey(branchId);
        const xom = ls.get(kalit);
        let tiklandi = false;
        if (xom) {
          try {
            const d = JSON.parse(xom) as Record<string, EditVal>;
            for (const [id, ev] of Object.entries(d)) {
              const serverdagi = v[Number(id)];
              if (!serverdagi || !ev || typeof ev.qty !== "string" || typeof ev.note !== "string") continue;
              // "Tiklandi" faqat serverdagidan FARQ qilganda: bir xil bo'lsa
              // (saqlangan qator) banner ham, `dirty` ham keraksiz yonardi.
              if (ev.qty !== serverdagi.qty || ev.note !== serverdagi.note) tiklandi = true;
              v[Number(id)] = ev;
            }
          } catch { ls.del(kalit); }
        }
        valsBranch.current = branchId; // endi `vals` shu filialniki — yozish mumkin
        setVals(v);
        setRestored(tiklandi); setDirty(tiklandi);
        setErr(""); setSavedMsg("");
        setRes({ branchId, items: r.items, err: "" });
      } catch (e) {
        if (cancelled) return;
        valsBranch.current = null; // yuklanmadi — hech narsa yozilmasin
        setRes({ branchId, items: [], err: xatoMatn(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [branchId, qayta]);

  /* Qoralamani yozish (300ms debounce) — faqat saqlanmagan o'zgarish bo'lganda VA
     `vals` haqiqatan shu filialniki bo'lsa. Egalik tekshiruvisiz filial almashuvi
     paytida (fetch hali tugamagan) eski sanoqlar yangi kalitga yozilardi. */
  useEffect(() => {
    if (!branchId || !dirty || valsBranch.current !== branchId) return;
    const t = setTimeout(() => ls.set(draftKey(branchId), JSON.stringify(vals)), 300);
    return () => clearTimeout(t);
  }, [vals, dirty, branchId]);

  /** Filial almashuvi: eski sanoqlarni O'Z kalitiga yozib, holatni tozalaymiz. */
  const filialAlmashtir = (yangi: number) => {
    if (yangi === branchId) return;
    // Debounce taymeri effekt cleanup'ida o'chadi — oxirgi kiritishni shu yerda
    // darhol yozib qo'yamiz, aks holda 300ms ichida almashsa yo'qolardi.
    if (dirty && valsBranch.current === branchId) ls.set(draftKey(branchId), JSON.stringify(vals));
    valsBranch.current = null;
    setVals({}); setDirty(false); setRestored(false);
    setErr(""); setSavedMsg("");
    setBranchId(yangi);
  };

  const setVal = (productId: number, patch: Partial<EditVal>) => {
    setVals((v) => {
      const cur = v[productId] ?? { qty: "", note: "" };
      return { ...v, [productId]: { ...cur, ...patch } };
    });
    editSeq.current += 1;
    setDirty(true);
    setSavedMsg("");
  };

  const bump = (it: InvItem, delta: number) => {
    haptic.impact();
    const cur = vals[it.productId]?.qty ?? "";
    const base = cur.trim() === "" || !Number.isFinite(Number(cur)) ? it.systemQty : Number(cur);
    setVal(it.productId, { qty: String(Math.max(0, Math.round((base + delta) * 1000) / 1000)) });
  };

  const filled = items.filter((it) => {
    const q = vals[it.productId]?.qty ?? "";
    return q.trim() !== "" && Number.isFinite(Number(q)) && Number(q) >= 0;
  });

  /* Saqlanmagan sanoq bo'lsa Telegram yopishdan oldin tasdiq so'raydi.
     `items` emas, `vals` ustidan: (a) yuklanish paytida items [] bo'ladi,
     (b) "12." kabi vaqtincha yaroqsiz matn va izoh-only qatorlar ham
     saqlanmagan mehnat — ular `filled` ga tushmaydi. */
  const unsaved = dirty && Object.values(vals).some((v) => v.qty.trim() !== "" || v.note.trim() !== "");
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (unsaved) tg?.enableClosingConfirmation?.();
    else tg?.disableClosingConfirmation?.();
    return () => { window.Telegram?.WebApp?.disableClosingConfirmation?.(); };
  }, [unsaved]);

  const save = async () => {
    if (saving || filled.length === 0) return;
    setSaving(true); setErr(""); setSavedMsg("");
    const seq = editSeq.current;      // save davomida kiritilganini aniqlash uchun
    const saqlangan = branchId;       // javob kelguncha filial almashishi mumkin
    try {
      const yuborilgan = filled.map((it) => {
        const v = vals[it.productId];
        return { productId: it.productId, countedQty: Number(v.qty), ...(v.note.trim() ? { note: v.note.trim() } : {}) };
      });
      const r = await api<{ ok: true; saved: number; skipped?: number }>("/api/miniapp-sotuv/inventar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId: saqlangan, items: yuborilgan }),
      });
      haptic.ok();
      /* Qoralamani BUTUNLAY o'chirmaymiz — serverga faqat `filled` ketdi. Izoh
         yozilgan-u qty bo'sh qator, yoki "-"/"1.2.3" kabi songa aylanmaydigan
         matn `filled` ga tushmaydi; o'chirilsa ular jimgina yo'qolardi.
         save davomida yangi qiymat kiritilgan bo'lsa (editSeq o'zgargan) umuman
         tegmaymiz: yangi `vals` ni debounce effekti to'liq yozib qo'yadi. */
      let bor = false;
      let qoldiqSoni = 0;
      if (editSeq.current === seq) {
        const ketdi = new Set(yuborilgan.map((i) => i.productId));
        const qoldiq: Record<string, EditVal> = {};
        for (const [id, ev] of Object.entries(vals)) {
          if (ketdi.has(Number(id))) continue;
          if (ev.qty.trim() !== "" || ev.note.trim() !== "") qoldiq[id] = ev;
        }
        qoldiqSoni = Object.keys(qoldiq).length;
        bor = qoldiqSoni > 0;
        if (bor) ls.set(draftKey(saqlangan), JSON.stringify(qoldiq));
        else ls.del(draftKey(saqlangan));
      }
      // Javob kelguncha filial almashgan bo'lsa holat endi BOSHQA filialniki —
      // uning `dirty`/banneriga tegmaymiz (qoralama yuqorida o'z kalitiga yozildi).
      if (valsBranch.current === saqlangan) {
        // Qoldiq borligini AYTAMIZ. Aks holda qator abadiy "saqlanmagan" holatda
        // qotib qolardi (yopish tasdig'i doim yoqiq, banner doim yonadi) va xodim
        // nima yuborilmaganini bilmasdi — miqdorsiz qatorni server qabul qilmaydi.
        // `skipped` — server ro'yxatidan tushib qolgan SKU'lar (admin ro'yxatni
        // o'zgartirgan). Ilgari server butun paketni rad etardi; endi qolganlari
        // saqlanadi, lekin xodim NIMA saqlanmaganini bilishi shart.
        const qismlar = [`✓ ${r.saved} ta SKU saqlandi`];
        if (qoldiqSoni > 0) qismlar.push(`${qoldiqSoni} ta qatorda miqdor yo'q — saqlanmadi`);
        if (r.skipped) qismlar.push(`${r.skipped} tasi ro'yxatdan chiqarilgan — saqlanmadi`);
        setSavedMsg(qismlar.join(" · "));
        setRestored(false);
        if (editSeq.current === seq) setDirty(bor);
      }
    } catch (e) {
      haptic.err();
      setErr(e instanceof Error ? e.message : "Xatolik — qayta urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  };

  if (me.branches.length === 0) {
    return <div className="card center"><p className="muted">Sizga filial biriktirilmagan.</p></div>;
  }

  return (
    <>
      {me.branches.length > 1 ? (
        <div className="selrow">
          <select className="sel" value={branchId} onChange={(e) => filialAlmashtir(Number(e.target.value))}>
            {me.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      ) : (
        <p className="statline">📍 {me.branches[0].name}</p>
      )}

      {!loading && !loadErr && items.length > 0 && (
        <>
          <div className="invsummary">
            <span className="t">Sanaldi {filled.length}/{items.length}</span>
            <span className="t muted-c">{formatDateUZ(todayTashkentISO())}</span>
          </div>
          <div className="invprog"><i style={{ width: `${(filled.length / items.length) * 100}%` }} /></div>
        </>
      )}

      {/* Ro'yxat yuklanmadi — qayta urinish (res=null → skeleton qaytadi, ya'ni
          takroriy muvaffaqiyatsizlikda ham "bosildi" degan fikrbildirish bor).
          `err` — saqlash xatosi: uni qayta yuklash tuzatmaydi, sanoq esa
          o'chib ketardi, shuning uchun tugma faqat `loadErr` da. */}
      {loadErr && (
        <p className="err">
          {loadErr}{" "}
          <button className="inretry" onClick={() => { setRes(null); setQayta((n) => n + 1); }}>↻ Qayta urinish</button>
        </p>
      )}
      {!loadErr && err && <p className="err">{err}</p>}
      {restored && <p className="draft">↺ Saqlanmagan qoralama tiklandi</p>}
      {savedMsg && <p className="saved">{savedMsg}</p>}
      {loading && <div className="skwrap"><div className="sk inv" /><div className="sk inv" /><div className="sk inv" /></div>}

      {!loading && !loadErr && items.length === 0 && (
        <div className="empty">
          <div className="lockic" style={{ background: "var(--brand-soft)" }}>📦</div>
          <p className="muted">Bu filial uchun sanaladigan SKU belgilanmagan.</p>
          <p className="muted small">Ro&apos;yxat platformada (Inventarizatsiya bo&apos;limi) tuziladi.</p>
        </div>
      )}

      {!loading && items.map((it) => {
        const v = vals[it.productId] ?? { qty: "", note: "" };
        const num = v.qty.trim() === "" ? null : Number(v.qty);
        const diff = num != null && Number.isFinite(num) ? num - it.systemQty : null;
        const state = diff == null ? "none" : diff === 0 ? "zero" : diff > 0 ? "surp" : "short";
        const pillText = diff == null ? "—" : diff === 0 ? "✓ mos" : `${diff > 0 ? "+" : ""}${Number(diff.toFixed(3)).toLocaleString("uz-UZ")}`;
        const showNote = (diff != null && diff !== 0) || v.note !== "";
        return (
          <div key={it.productId} className="invcard" data-s={state}>
            <div className="invtop">
              <div className="invtitle">
                <div className="invname">{it.name}</div>
                <div className="invmeta">Kod {it.code} · Tizim: <b>{formatQty(it.systemQty)}</b></div>
              </div>
              <span key={pillText} className={`pill ${state}`}>{pillText}</span>
            </div>
            <div className="counter">
              <button className="step" onClick={() => bump(it, -1)} aria-label="Kamaytirish">−</button>
              <input
                type="number" inputMode="decimal" min={0}
                className={v.qty.trim() !== "" ? "filled" : ""}
                placeholder="Sanaldi…" value={v.qty}
                onChange={(e) => setVal(it.productId, { qty: e.target.value })}
              />
              <button className="step" onClick={() => bump(it, 1)} aria-label="Ko'paytirish">+</button>
            </div>
            {showNote && (
              <input className="invnote" placeholder="Izoh (kamomad/ortiqcha sababi)…" maxLength={500}
                value={v.note} onChange={(e) => setVal(it.productId, { note: e.target.value })} />
            )}
          </div>
        );
      })}

      {!loading && items.length > 0 && (
        <div className="savebar">
          <div className="barcol">
            <button className="savebtn" disabled={saving || filled.length === 0} onClick={save}>
              {saving ? "Saqlanmoqda…" : <>✅ Saqlash <span className="cnt">{filled.length} ta</span></>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Shell + dizayn tokenlari (Designer spec) ─────────────────────────────────

function Shell({ theme, children }: { theme: "light" | "dark"; children: React.ReactNode }) {
  return (
    <div className="wrap" data-theme={theme}>
      <div className="col">{children}</div>
      <style>{`
        /* Fon EKRAN BO'YLAB (.wrap), 460px cheklov ICHKARIDA (.col). Aks holda
           keng viewport'da (Telegram Desktop) yon tomonlarda sahifaning global
           foni ko'rinib, kontent "qirqilgan"dek chiqadi. */
        body { background: var(--tg-theme-bg-color, #F4F7F5); }
        .wrap { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased; min-height: 100dvh;
          background: var(--bg); color: var(--ink-1);

          /* Baza: Telegram temadan (fallback bilan) */
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

          /* Brend emerald. Gradient ATAYLAB oldingidan qorong'iroq: oq matn
             (eyebrow/KPI) eski #12B67F ustida 2.2–3.9:1 berardi — AA dan past.
             Bu token .avatar/.savebtn/.tabnav::before da ham ishlatiladi, ular
             ham oq matnli, ya'ni qoraytirish faqat foyda keltiradi. */
          --brand: #10B981; --brand-2: #059669; --brand-deep: #047857;
          --brand-soft: color-mix(in srgb, var(--brand) 14%, transparent);
          --hero-grad: linear-gradient(152deg, #0C9268 0%, #076F52 52%, #05513C 100%);
          --hero-glow: radial-gradient(130px 130px at 84% -12%, rgba(255,255,255,.14), transparent 70%);
          /* Matn ostidagi scrim — FAQAT .hero da. Karta tepasi (eyebrow) va
             pastki KPI qatorini qoraytiradi, o'rtasi ochiq qolib gradient
             ko'rinishini saqlaydi. */
          --hero-scrim: linear-gradient(180deg, rgba(0,0,0,.30) 0%, rgba(0,0,0,.06) 44%, rgba(0,0,0,.26) 100%);

          /* Semantik */
          --kamomad: #E5484D; --kamomad-soft: color-mix(in srgb, #E5484D 13%, transparent);
          --ortiqcha: #F59E0B; --ortiqcha-soft: color-mix(in srgb, #F59E0B 15%, transparent);
          --mos: #10B981; --mos-soft: color-mix(in srgb, #10B981 15%, transparent);
          /* Ogohlantirish/xavf — inventar semantikasidan (kamomad/ortiqcha)
             ALOHIDA: reja va marja pog'onalari boshqa ma'no anglatadi. */
          --warn: #D97706; --warn-soft: color-mix(in srgb, #D97706 14%, transparent);
          --danger: #DC2626; --danger-soft: color-mix(in srgb, #DC2626 12%, transparent);

          --shadow: 0 1px 2px rgba(8,30,20,.05), 0 12px 28px -16px rgba(8,30,20,.14);
          --lift: 0 10px 26px -10px rgba(16,185,129,.5);

          /* Qotirilgan panellar balandligi — .savebar joylashuvi va .col pastki
             padding'i shulardan hisoblanadi (ilgari 67/152 qo'lda yozilgan
             sehrli raqamlar edi va bir-biridan mustaqil eskirardi). */
          --bar-h: 67px; --savebar-h: 72px;
          --safe-b: max(env(safe-area-inset-bottom, 0px), var(--tg-safe-area-inset-bottom, 0px)); }

        .wrap[data-theme="dark"] {
          --card-2: color-mix(in srgb, var(--tg-card) 80%, #ffffff 5%);
          --line: color-mix(in srgb, var(--tg-hint) 32%, transparent);
          --shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 14px 32px -18px rgba(0,0,0,.65);
          --brand-soft: color-mix(in srgb, var(--brand) 22%, transparent);
          /* Qorong'i fonda to'q sariq/qizil o'qilmaydi — ochroq variant */
          --warn: #FBBF24; --warn-soft: color-mix(in srgb, #FBBF24 20%, transparent);
          --danger: #F87171; --danger-soft: color-mix(in srgb, #F87171 18%, transparent); }

        /* Kontent ustuni; pastki padding ikkala qotirilgan panelni + home-indicator zonasini qoplaydi */
        .col { max-width: 460px; margin: 0 auto;
          padding: 8px 15px calc(var(--bar-h) + var(--savebar-h) + 13px + var(--safe-b)); }
        /* Qotirilgan panellar: fon/chegara ekran bo'ylab, kontent markazda */
        .barcol { max-width: 460px; margin: 0 auto; }

        .brandbar { display: flex; align-items: center; gap: 9px; padding: 14px 2px 12px; }
        .branddot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft); }
        .brandbar b { font-size: 16px; font-weight: 700; letter-spacing: -.3px; }
        /* max-width: brandbar'ga refresh tugmasi (32px + 8px) qo'shilgach uzun
           ism <b> ni qisardi. Ellipsis ismning O'ZIDA (.whon): flex konteynerda
           text-overflow yalang' matn tugunini kesmaydi. */
        .who { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-3); font-weight: 600;
          min-width: 0; max-width: 55%; }
        .whon { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* Yangilash — 32px nishon (WCAG 2.2 AA 24px dan katta) */
        .refresh { flex: 0 0 auto; width: 32px; height: 32px; margin-left: 8px; display: grid; place-items: center;
          border: 1px solid var(--line); background: var(--card); color: var(--ink-2); border-radius: 10px; }
        .refresh svg { width: 16px; height: 16px; }
        .refresh:active { transform: scale(.94); }
        .refresh:disabled { opacity: .6; }
        .refresh[data-spin="1"] svg { animation: spin .9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .avatar { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff;
          background: var(--hero-grad); }

        .muted { color: var(--ink-3); font-size: 13px; line-height: 1.5; }
        .muted-c { color: var(--ink-3); }
        .small { font-size: 12px; margin-top: 6px; }
        .center { text-align: center; padding: 26px 16px; }
        .statline { color: var(--ink-2); font-size: 12.5px; font-weight: 600; margin: 0 2px 10px; }

        /* Yashirilgan tab — unmount EMAS (holat saqlanadi), faqat ko'rinmaydi */
        .pane.off { display: none; }

        /* Ma'lumot eskirganligi — doimiy status qatori */
        .datastat { display: flex; align-items: center; gap: 8px; margin: 0 2px 10px;
          font-size: 12px; font-weight: 600; color: var(--ink-2); }
        .datastat .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto;
          background: var(--ortiqcha); box-shadow: 0 0 0 3px var(--ortiqcha-soft); }

        .seg { display: flex; padding: 3px; gap: 2px; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 11px; }
        .seg button { flex: 1; border: 0; background: transparent; color: var(--ink-2); font-size: 13px; font-weight: 600; padding: 9px 0; border-radius: 11px;
          transition: transform .15s, box-shadow .2s, color .2s; }
        .seg button:active { transform: scale(.97); }
        .seg button.on { background: var(--card); color: var(--ink-1); box-shadow: var(--shadow); }

        .selrow { margin-bottom: 11px; }
        /* font-size 16px MAJBURIY: iOS Safari/WebView 16px dan kichik maydonga
           fokusda sahifani zoom qiladi va qaytarmaydi. Vizual balandlik
           padding bilan saqlangan (12px → 10.5px). */
        .sel { width: 100%; appearance: none; border: 1px solid var(--line); background: var(--card); color: var(--ink-1);
          border-radius: 13px; padding: 10.5px 34px 10.5px 14px; font-size: 16px; font-weight: 600; outline: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%238A9C93' stroke-width='1.6' fill='none' stroke-linecap='round'/></svg>");
          background-repeat: no-repeat; background-position: right 14px center; }
        .sel:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }

        /* Hero — brend-gradientli pul kartasi */
        .hero { position: relative; overflow: hidden; border-radius: 22px; padding: 18px 18px 16px; color: #fff;
          background: var(--hero-scrim), var(--hero-glow), var(--hero-grad);
          box-shadow: 0 16px 36px -16px rgba(6,95,70,.55); margin-bottom: 11px; }
        /* Alfalar o'lchov bo'yicha tanlangan (scrim + qorong'i gradient ustida):
           .86 → 4.67:1, .80 → 6.9:1 — ikkalasi ham WCAG AA (4.5:1) dan yuqori,
           ammo ierarxiya (yorliq < qiymat) saqlanadi. */
        .hero .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: rgba(255,255,255,.86); }
        .hero .val { font-size: 34px; font-weight: 800; letter-spacing: -1px; line-height: 1.05; margin-top: 5px; font-variant-numeric: tabular-nums; }
        .hero .val .unit { font-size: 15px; font-weight: 700; letter-spacing: 0; margin-left: 6px; opacity: .6; }
        .hero .spark { display: block; width: 100%; height: 26px; margin-top: 10px; overflow: visible; }
        .hero .sub { display: grid; grid-template-columns: 1fr 1fr; margin-top: 15px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.16); }
        .hero .sub .k { font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: rgba(255,255,255,.80); }
        .hero .sub .n { font-size: 17px; font-weight: 800; margin-top: 3px; font-variant-numeric: tabular-nums; }
        .hero .sub > div + div { padding-left: 14px; border-left: 1px solid rgba(255,255,255,.14); }

        /* 0-holat hero */
        .hero.zero { background: var(--card); color: var(--ink-1); border: 1px solid var(--line); box-shadow: var(--shadow); text-align: center; padding: 26px 18px; }
        .hero.zero .ic { width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 16px; display: grid; place-items: center; background: var(--brand-soft); font-size: 24px; }
        .hero.zero .t { font-size: 16px; font-weight: 800; }
        .hero.zero .s { font-size: 12.5px; color: var(--ink-3); margin-top: 5px; line-height: 1.5; }

        .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 14px; box-shadow: var(--shadow); margin-bottom: 11px; }
        .chead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
        .chead b { font-size: 14px; font-weight: 700; letter-spacing: -.1px; }
        .pct { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }

        /* Reja — arc gauge */
        .plancard { display: flex; align-items: center; gap: 16px; }
        .gauge { position: relative; width: 104px; height: 104px; flex: 0 0 auto; }
        .gauge svg { width: 100%; height: 100%; }
        .gauge .center { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; }
        .gauge .pctv { font-size: 24px; font-weight: 800; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
        .gauge .pctl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--ink-3); margin-top: -2px; }
        .planside { flex: 1; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
        .prow { display: flex; justify-content: space-between; font-size: 13px; }
        .prow .k { color: var(--ink-3); font-weight: 600; }
        .prow .v { font-weight: 800; font-variant-numeric: tabular-nums; }
        .planchip { align-self: flex-start; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
        .planchip.good { color: var(--brand-deep); background: var(--mos-soft); }
        /* Reja semantikasi — --warn (inventar --ortiqcha si EMAS, ma'no boshqa) */
        .planchip.warn { color: var(--warn); background: var(--warn-soft); }
        .wrap[data-theme="dark"] .planchip.good { color: var(--brand); }

        /* Filiallar — ranked leaderboard. Grid o'rniga ikki flex qator:
           grid'da .sh (ustun 3) va .track (2/-1) bir katakka da'vogar bo'lib,
           .sh 3-qatorga tushib ~13px ortiqcha balandlik hosil qilardi. */
        .brow { padding: 9px 8px; border-radius: 12px; }
        .brow.lead { background: var(--brand-soft); }
        .btop { display: flex; align-items: center; gap: 10px; }
        /* padding-left = .brank (20px) + gap (10px): eski grid'da .track
           "grid-column: 2 / -1" bilan aynan nom ostidan boshlanardi. */
        .bbot { display: flex; align-items: center; gap: 10px; margin-top: 5px; padding-left: 30px; }
        /* Qat'iy 20px — eski grid ustuni bilan bir xil: "min-width" bo'lsa
           ikki xonali rank (10+) kengayib, nomlar qatordan qatorga siljirdi. */
        .brank { flex: 0 0 20px; font-size: 11px; font-weight: 800; color: var(--ink-3); font-variant-numeric: tabular-nums; }
        .brow.lead .brank { color: var(--brand-deep); }
        .wrap[data-theme="dark"] .brow.lead .brank { color: var(--brand); }
        .bn { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bv { flex: 0 0 auto; font-size: 13.5px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
        .track { flex: 1; min-width: 0; height: 6px; border-radius: 999px; background: var(--line-2); overflow: hidden; }
        .track i { display: block; height: 100%; border-radius: 999px; background: var(--hero-grad); transition: width .5s cubic-bezier(.3,.8,.3,1); }
        .sh { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }

        /* Marja */
        .mrow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line-2); font-size: 13.5px; }
        .mrow:first-of-type { border-top: 0; }
        .mdot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
        .mn { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mv { font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }
        .mm { width: 52px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }

        /* Inventar */
        .invsummary { display: flex; align-items: center; justify-content: space-between; margin: 2px 2px 7px; }
        .invsummary .t { font-size: 12.5px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }
        .invprog { height: 6px; border-radius: 999px; background: var(--line-2); overflow: hidden; margin: 0 2px 12px; }
        .invprog i { display: block; height: 100%; background: var(--hero-grad); border-radius: 999px; transition: width .4s ease; }

        .invcard { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 16px;
          padding: 12px 13px 12px 15px; box-shadow: var(--shadow); margin-bottom: 9px; overflow: hidden; }
        .invcard::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; transition: background .2s; }
        .invcard[data-s="short"]::before { background: var(--kamomad); }
        .invcard[data-s="surp"]::before { background: var(--ortiqcha); }
        .invcard[data-s="zero"]::before { background: var(--mos); }
        .invtop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .invtitle { min-width: 0; }
        .invname { font-size: 14px; font-weight: 700; line-height: 1.25; letter-spacing: -.1px; }
        .invmeta { font-size: 11.5px; color: var(--ink-3); margin-top: 2px; font-variant-numeric: tabular-nums; }
        .invmeta b { color: var(--ink-2); font-weight: 700; }
        .pill { flex: 0 0 auto; font-size: 12.5px; font-weight: 800; padding: 5px 10px; border-radius: 9px; font-variant-numeric: tabular-nums; white-space: nowrap;
          animation: pop .18s ease; }
        .pill.short { color: var(--kamomad); background: var(--kamomad-soft); }
        .pill.surp { color: var(--ortiqcha); background: var(--ortiqcha-soft); }
        .pill.zero { color: var(--brand-deep); background: var(--mos-soft); }
        .wrap[data-theme="dark"] .pill.zero { color: var(--brand); }
        .pill.none { color: var(--ink-3); background: var(--line-2); animation: none; }
        @keyframes pop { from { transform: scale(.85); opacity: .6; } to { transform: none; opacity: 1; } }

        .counter { display: flex; align-items: stretch; gap: 8px; }
        .counter .step { width: 44px; height: 44px; flex: 0 0 auto; border: 1px solid var(--line); background: var(--card-2); color: var(--ink-1);
          border-radius: 12px; font-size: 22px; font-weight: 700; line-height: 1; transition: transform .1s, background .15s; }
        .counter .step:active { transform: scale(.92); background: var(--brand-soft); }
        .counter input { flex: 1; min-width: 0; height: 44px; text-align: center; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums;
          border: 1.5px solid var(--line); background: var(--card-2); color: var(--ink-1); border-radius: 12px; padding: 0 8px; outline: none;
          -moz-appearance: textfield; }
        .counter input::-webkit-outer-spin-button, .counter input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .counter input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
        .counter input.filled { border-color: var(--brand); }
        /* 16px — iOS zoom himoyasi (yuqoridagi .sel izohiga qarang) */
        .invnote { margin-top: 8px; width: 100%; box-sizing: border-box; border: 1px solid var(--line); background: var(--card-2); color: var(--ink-1);
          border-radius: 11px; padding: 8px 12px; font-size: 16px; outline: none; }
        .invnote:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
        .invnote::placeholder { color: var(--ink-3); }

        .empty { text-align: center; padding: 34px 20px; }

        /* Tab-bar — sliding segmented.
           safe-area: env() YOLG'IZ yetarli emas — u viewport-fit=cover
           e'lon qilinmasa spec bo'yicha 0 qaytaradi (page.tsx da qo'shildi),
           Telegram esa o'z --tg-safe-area-inset-bottom ini beradi. max() —
           qaysi biri mavjud bo'lsa o'sha ishlaydi (--safe-b tokeni). */
        .tabbar { position: fixed; left: 0; right: 0; bottom: 0;
          padding: 8px 15px calc(10px + var(--safe-b));
          background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(16px); border-top: 1px solid var(--line); z-index: 30; }
        .tabnav { position: relative; display: grid; grid-template-columns: 1fr 1fr; background: var(--card-2); border: 1px solid var(--line);
          border-radius: 16px; padding: 4px; }
        .tabnav::before { content: ""; position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 12px;
          background: var(--hero-grad); box-shadow: var(--lift); transition: transform .28s cubic-bezier(.4,.9,.3,1); }
        .tabnav[data-active="inventar"]::before { transform: translateX(100%); }
        .tabbtn { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 11px;
          background: transparent; border: 0; font-size: 13px; font-weight: 700; color: var(--ink-2); transition: color .2s; }
        .tabbtn[aria-pressed="true"] { color: #fff; }
        .tabbtn svg { width: 17px; height: 17px; }

        /* Tab-bar USTIDA turadi: ikkalasi ham bottom:0 / z-index:30 bo'lganda
           savebar DOM'da oldin kelgani uchun tab-bar uni yopib qo'yardi va
           Saqlash tugmasi bosilmasdi. Endi tab-bar balandligicha ko'tarilgan. */
        .savebar { position: fixed; left: 0; right: 0;
          bottom: calc(var(--bar-h) + var(--safe-b));
          padding: 11px 15px 13px;
          background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(16px); border-top: 1px solid var(--line); z-index: 31; }
        .savebtn { width: 100%; border: 0; border-radius: 15px; padding: 15px; font-size: 15px; font-weight: 800; letter-spacing: -.2px; color: #fff;
          background: var(--hero-grad); box-shadow: var(--lift); display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform .12s; }
        .savebtn:active { transform: scale(.98); }
        .savebtn:disabled { opacity: .45; box-shadow: none; }
        .savebtn .cnt { background: rgba(255,255,255,.24); border-radius: 8px; padding: 1px 8px; font-variant-numeric: tabular-nums; }

        .err { color: var(--kamomad); font-size: 13px; font-weight: 600; margin: 6px 2px 10px; background: var(--kamomad-soft);
          border: 1px solid var(--kamomad-soft); border-radius: 12px; padding: 10px 13px; }
        .saved { color: var(--brand-deep); font-size: 13px; font-weight: 700; margin: 6px 2px 10px; background: var(--mos-soft);
          border: 1px solid var(--mos-soft); border-radius: 12px; padding: 10px 13px; }
        .wrap[data-theme="dark"] .saved { color: var(--brand); }
        .draft { color: var(--ortiqcha); font-size: 12.5px; font-weight: 700; margin: 6px 2px 10px;
          background: var(--ortiqcha-soft); border: 1px solid var(--ortiqcha-soft); border-radius: 12px; padding: 10px 13px; }

        /* Qayta urinish — to'liq ekran xatosida (.retry) va qator ichida (.inretry) */
        .retry { margin-top: 18px; border: 0; border-radius: 14px; padding: 13px 22px; font-size: 14.5px; font-weight: 800;
          color: #fff; background: var(--hero-grad); box-shadow: var(--lift); }
        .retry:active { transform: scale(.97); }
        .inretry { display: inline-block; margin-left: 4px; border: 1px solid currentColor; background: transparent;
          color: inherit; border-radius: 9px; padding: 4px 10px; font-size: 12px; font-weight: 700; }
        .inretry:active { transform: scale(.96); }

        .locked { text-align: center; padding: 44px 20px; }
        .lockic { width: 62px; height: 62px; margin: 0 auto 14px; display: grid; place-items: center; font-size: 26px; border-radius: 20px;
          background: color-mix(in srgb, var(--ink-3) 12%, transparent); }
        .locked h2 { margin: 0 0 6px; font-size: 19px; letter-spacing: -.3px; }
        .idbtn { margin: 16px auto 8px; display: inline-flex; flex-direction: column; align-items: center; gap: 3px; border: 1px solid var(--line);
          background: var(--brand-soft); border-radius: 14px; padding: 12px 22px; color: inherit; }
        .idbtn:active { transform: scale(.97); }
        .idnum { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .5px; }
        .idc { font-size: 11px; color: var(--ink-2); font-weight: 600; }
        h2 { margin: 6px 0; }

        /* Kirish animatsiyasi — staggered */
        .hero, .card, .invcard { animation: rise .45s cubic-bezier(.2,.7,.2,1) both; }
        .card:nth-of-type(1) { animation-delay: .04s; }
        .card:nth-of-type(2) { animation-delay: .09s; }
        .card:nth-of-type(3) { animation-delay: .14s; }
        @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        .skwrap { display: flex; flex-direction: column; gap: 9px; padding-top: 4px; }
        .sk { border-radius: 16px; background: linear-gradient(100deg, var(--line-2) 30%, var(--line) 50%, var(--line-2) 70%);
          background-size: 200% 100%; animation: shimmer 1.3s infinite; }
        .sk.h { height: 128px; border-radius: 22px; } .sk.r { height: 140px; } .sk.c { height: 150px; } .sk.inv { height: 118px; }
        @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

        @media (prefers-reduced-motion: reduce) {
          .sk, .hero, .card, .invcard, .pill { animation: none; }
          .seg button, .tabbtn, .savebtn, .counter .step, .tabnav::before, .track i, .invprog i { transition: none; }
        }
      `}</style>
    </div>
  );
}
