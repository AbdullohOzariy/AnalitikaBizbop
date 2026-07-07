"use client";

/**
 * BizbopSotuv Mini App — 2 tab:
 *   Hisobot — gradient "pul kartasi" (savdo + KPI), reja arc-gauge, filiallar
 *   leaderboard, marja; Inventar — SKU sanash (progress, chap-accent kartalar).
 * Dizayn: Designer spec (Revolut/TON-apps naqshlari) — brend emerald, TG tema.
 * Auth: Telegram initData ("x-telegram-init-data" header) → /api/miniapp-sotuv/me.
 * Window.Telegram global tipi sverka-app.tsx da e'lon qilingan (declare global).
 */
import { useEffect, useRef, useState } from "react";
import { isoDay, todayTashkentISO } from "@/lib/date";
import { formatUZS, formatNumber, formatDateUZ } from "@/lib/format";

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "x-telegram-init-data": initData },
  });
  const j = (await res.json()) as T & { xato?: string };
  if (!res.ok) throw new Error(j?.xato ?? "Xatolik yuz berdi");
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

export function SotuvApp() {
  const [phase, setPhase] = useState<"loading" | "denied" | "app">("loading");
  const [deniedMsg, setDeniedMsg] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<"hisobot" | "inventar">("hisobot");
  const [tgId, setTgId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    // Tema Telegram'dan (prefers-color-scheme emas — custom temalar mos kelmaydi)
    tg?.onEvent?.("themeChanged", () => setTheme(tg?.colorScheme ?? "light"));
    (async () => {
      setTheme(tg?.colorScheme ?? "light");
      setTgId(tg?.initDataUnsafe?.user?.id ?? null);
      try {
        const r = await api<{ ok: true; user: MeUser }>("/api/miniapp-sotuv/me");
        setMe(r.user);
        setPhase("app");
      } catch (e) {
        setDeniedMsg(e instanceof Error ? e.message : "Telegram orqali oching.");
        setPhase("denied");
      }
    })();
  }, []);

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
        <span className="who"><span className="avatar">{initials(me.name)}</span>{me.name}</span>
      </div>
      {tab === "hisobot" ? <HisobotTab me={me} /> : <InventarTab me={me} />}
      {me.canInventory && (
        <div className="tabbar">
          <div className="tabnav" data-active={tab}>
            <button className="tabbtn" aria-pressed={tab === "hisobot"} onClick={() => switchTab("hisobot")}>
              <IconChart /> Hisobot
            </button>
            <button className="tabbtn" aria-pressed={tab === "inventar"} onClick={() => switchTab("inventar")}>
              <IconBox /> Inventar
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ─── Hisobot ──────────────────────────────────────────────────────────────────

function HisobotTab({ me }: { me: MeUser }) {
  const single = me.branches.length === 1;
  const [davr, setDavr] = useState<Davr>("bugun");
  const [branchId, setBranchId] = useState<number>(single ? me.branches[0].id : 0);
  const [res, setRes] = useState<{ key: string; data: DashData | null; err: string } | null>(null);
  const key = `${davr}|${branchId}`;
  const loading = res?.key !== key;
  const data = loading ? null : res?.data ?? null;
  const err = loading ? "" : res?.err ?? "";

  useEffect(() => {
    let cancelled = false;
    const k = `${davr}|${branchId}`;
    (async () => {
      try {
        const { start, end } = davrRange(davr);
        const q = new URLSearchParams({ start, end });
        if (branchId > 0) q.set("branchId", String(branchId));
        const r = await api<{ ok: true } & DashData>(`/api/miniapp-sotuv/dashboard?${q}`);
        if (!cancelled) setRes({ key: k, data: r, err: "" });
      } catch (e) {
        if (!cancelled) setRes({ key: k, data: null, err: e instanceof Error ? e.message : "Xatolik yuz berdi" });
      }
    })();
    return () => { cancelled = true; };
  }, [davr, branchId]);

  const setDavrH = (d: Davr) => { if (d !== davr) { haptic.select(); setDavr(d); } };
  const davrLabel = DAVRLAR.find((d) => d.key === davr)?.label.toLowerCase() ?? "";
  const isZero = !!data && data.kpi.sales === 0 && data.kpi.receipts === 0;
  const sorted = data ? [...data.branches].sort((a, b) => b.sales - a.sales) : [];
  const maxBranch = Math.max(1, ...sorted.map((b) => b.sales));

  return (
    <>
      <div className="seg">
        {DAVRLAR.map((d) => (
          <button key={d.key} className={davr === d.key ? "on" : ""} onClick={() => setDavrH(d.key)}>{d.label}</button>
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

      {err && <p className="err">{err}</p>}
      {loading && <div className="skwrap"><div className="sk h" /><div className="sk r" /><div className="sk c" /></div>}

      {!loading && data && isZero && (
        <>
          <div className="hero zero">
            <div className="ic">☀️</div>
            <div className="t">{davr === "bugun" ? "Bugun savdo hali boshlanmadi" : "Bu davrda savdo topilmadi"}</div>
            <div className="s">
              {data.lastDataDay
                ? <>Ma&apos;lumot {formatDateUZ(data.lastDataDay)} gacha mavjud. {davr === "bugun" ? "7 kun yoki Oy'ni tanlang." : ""}</>
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
          <HeroCard sales={data.kpi.sales} receipts={data.kpi.receipts} avgReceipt={data.kpi.avgReceipt} davrLabel={davrLabel} />

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
              {sorted.map((b, i) => (
                <div key={b.id} className={`brow ${i === 0 ? "lead" : ""}`}>
                  <span className="brank">{i + 1}</span>
                  <span className="bn">{b.name}</span>
                  <span className="bv">{formatUZS(b.sales, { compact: true })}</span>
                  <div className="track"><i style={{ width: `${Math.max(4, (b.sales / maxBranch) * 100)}%` }} /></div>
                  <span className="sh">{b.share.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="chead"><b>Marja · guruhlar</b></div>
            {data.marja.length === 0 && <p className="muted">Ma&apos;lumot yo&apos;q</p>}
            {data.marja.map((m) => {
              const col = m.marja == null ? "var(--ink-3)" : m.marja >= 20 ? "var(--brand)" : m.marja >= 12 ? "var(--ink-2)" : "var(--ortiqcha)";
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
function HeroCard({ sales, receipts, avgReceipt, davrLabel }: {
  sales: number; receipts: number; avgReceipt: number; davrLabel: string;
}) {
  const animated = useCountUp(sales);
  return (
    <div className="hero">
      <div className="eyebrow">Savdo · {davrLabel}</div>
      <div className="val">{formatUZS(animated, { compact: true })}</div>
      <div className="sub">
        <div><div className="k">Cheklar</div><div className="n">{formatNumber(receipts)}</div></div>
        <div><div className="k">O&apos;rtacha chek</div><div className="n">{formatUZS(avgReceipt, { compact: true })}</div></div>
      </div>
    </div>
  );
}

/** Sof-SVG arc gauge — 270° yoy, markazda %. */
function Gauge({ percent }: { percent: number }) {
  const C = 289.03, ARC = 216.77; // 2π·46 ; 0.75·C
  const pct = Math.min(100, Math.max(0, percent));
  const off = ARC * (1 - pct / 100);
  const col = percent >= 100 ? "var(--brand)" : "var(--ortiqcha)";
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

function InventarTab({ me }: { me: MeUser }) {
  const [branchId, setBranchId] = useState<number>(me.branches[0]?.id ?? 0);
  const [res, setRes] = useState<{ branchId: number; items: InvItem[]; err: string } | null>(null);
  const [vals, setVals] = useState<Record<number, EditVal>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  const loading = res?.branchId !== branchId;
  const items = loading ? [] : res?.items ?? [];
  const loadErr = loading ? "" : res?.err ?? "";

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
        setVals(v);
        setErr(""); setSavedMsg("");
        setRes({ branchId, items: r.items, err: "" });
      } catch (e) {
        if (!cancelled) setRes({ branchId, items: [], err: e instanceof Error ? e.message : "Xatolik yuz berdi" });
      }
    })();
    return () => { cancelled = true; };
  }, [branchId]);

  const setVal = (productId: number, patch: Partial<EditVal>) => {
    setVals((v) => {
      const cur = v[productId] ?? { qty: "", note: "" };
      return { ...v, [productId]: { ...cur, ...patch } };
    });
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

  const save = async () => {
    if (saving || filled.length === 0) return;
    setSaving(true); setErr(""); setSavedMsg("");
    try {
      const body = {
        branchId,
        items: filled.map((it) => {
          const v = vals[it.productId];
          return { productId: it.productId, countedQty: Number(v.qty), ...(v.note.trim() ? { note: v.note.trim() } : {}) };
        }),
      };
      const r = await api<{ ok: true; saved: number }>("/api/miniapp-sotuv/inventar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      haptic.ok();
      setSavedMsg(`✓ ${r.saved} ta SKU saqlandi`);
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
          <select className="sel" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
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

      {(loadErr || err) && <p className="err">{loadErr || err}</p>}
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
                <div className="invmeta">Kod {it.code} · Tizim: <b>{formatNumber(it.systemQty)}</b></div>
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
          <button className="savebtn" disabled={saving || filled.length === 0} onClick={save}>
            {saving ? "Saqlanmoqda…" : <>✅ Saqlash <span className="cnt">{filled.length} ta</span></>}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Shell + dizayn tokenlari (Designer spec) ─────────────────────────────────

function Shell({ theme, children }: { theme: "light" | "dark"; children: React.ReactNode }) {
  return (
    <div className="wrap" data-theme={theme}>
      {children}
      <style>{`
        .wrap { max-width: 460px; margin: 0 auto; padding: 8px 15px 96px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
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

          /* Brend emerald */
          --brand: #10B981; --brand-2: #059669; --brand-deep: #047857;
          --brand-soft: color-mix(in srgb, var(--brand) 14%, transparent);
          --hero-grad: linear-gradient(152deg, #12B67F 0%, #0A8A63 52%, #065F46 100%);
          --hero-glow: radial-gradient(130px 130px at 84% -12%, rgba(255,255,255,.22), transparent 70%);

          /* Semantik */
          --kamomad: #E5484D; --kamomad-soft: color-mix(in srgb, #E5484D 13%, transparent);
          --ortiqcha: #F59E0B; --ortiqcha-soft: color-mix(in srgb, #F59E0B 15%, transparent);
          --mos: #10B981; --mos-soft: color-mix(in srgb, #10B981 15%, transparent);

          --shadow: 0 1px 2px rgba(8,30,20,.05), 0 12px 28px -16px rgba(8,30,20,.14);
          --lift: 0 10px 26px -10px rgba(16,185,129,.5); }

        .wrap[data-theme="dark"] {
          --card-2: color-mix(in srgb, var(--tg-card) 80%, #ffffff 5%);
          --line: color-mix(in srgb, var(--tg-hint) 32%, transparent);
          --shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 14px 32px -18px rgba(0,0,0,.65);
          --brand-soft: color-mix(in srgb, var(--brand) 22%, transparent); }

        .brandbar { display: flex; align-items: center; gap: 9px; padding: 14px 2px 12px; }
        .branddot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft); }
        .brandbar b { font-size: 16px; font-weight: 700; letter-spacing: -.3px; }
        .who { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-3); font-weight: 600; }
        .avatar { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff;
          background: var(--hero-grad); }

        .muted { color: var(--ink-3); font-size: 13px; line-height: 1.5; }
        .muted-c { color: var(--ink-3); }
        .small { font-size: 12px; margin-top: 6px; }
        .center { text-align: center; padding: 26px 16px; }
        .statline { color: var(--ink-2); font-size: 12.5px; font-weight: 600; margin: 0 2px 10px; }

        .seg { display: flex; padding: 3px; gap: 2px; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 11px; }
        .seg button { flex: 1; border: 0; background: transparent; color: var(--ink-2); font-size: 13px; font-weight: 600; padding: 9px 0; border-radius: 11px;
          transition: transform .15s, box-shadow .2s, color .2s; }
        .seg button:active { transform: scale(.97); }
        .seg button.on { background: var(--card); color: var(--ink-1); box-shadow: var(--shadow); }

        .selrow { margin-bottom: 11px; }
        .sel { width: 100%; appearance: none; border: 1px solid var(--line); background: var(--card); color: var(--ink-1);
          border-radius: 13px; padding: 12px 34px 12px 14px; font-size: 14.5px; font-weight: 600; outline: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%238A9C93' stroke-width='1.6' fill='none' stroke-linecap='round'/></svg>");
          background-repeat: no-repeat; background-position: right 14px center; }
        .sel:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }

        /* Hero — brend-gradientli pul kartasi */
        .hero { position: relative; overflow: hidden; border-radius: 22px; padding: 18px 18px 16px; color: #fff;
          background: var(--hero-glow), var(--hero-grad);
          box-shadow: 0 16px 36px -16px rgba(6,95,70,.55); margin-bottom: 11px; }
        .hero .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: rgba(255,255,255,.72); }
        .hero .val { font-size: 34px; font-weight: 800; letter-spacing: -1px; line-height: 1.05; margin-top: 5px; font-variant-numeric: tabular-nums; }
        .hero .sub { display: grid; grid-template-columns: 1fr 1fr; margin-top: 15px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.16); }
        .hero .sub .k { font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: rgba(255,255,255,.66); }
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
        .planchip.warn { color: var(--ortiqcha); background: var(--ortiqcha-soft); }
        .wrap[data-theme="dark"] .planchip.good { color: var(--brand); }

        /* Filiallar — ranked leaderboard */
        .brow { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 3px 10px; padding: 9px 8px; border-radius: 12px; }
        .brow.lead { background: var(--brand-soft); }
        .brank { font-size: 11px; font-weight: 800; color: var(--ink-3); font-variant-numeric: tabular-nums; }
        .brow.lead .brank { color: var(--brand-deep); }
        .wrap[data-theme="dark"] .brow.lead .brank { color: var(--brand); }
        .bn { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bv { font-size: 13.5px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
        .track { grid-column: 2 / -1; height: 6px; border-radius: 999px; background: var(--line-2); overflow: hidden; margin-top: 4px; }
        .track i { display: block; height: 100%; border-radius: 999px; background: var(--hero-grad); transition: width .5s cubic-bezier(.3,.8,.3,1); }
        .sh { grid-column: 3; font-size: 11px; font-weight: 700; color: var(--ink-3); font-variant-numeric: tabular-nums; }

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
        .invnote { margin-top: 8px; width: 100%; box-sizing: border-box; border: 1px solid var(--line); background: var(--card-2); color: var(--ink-1);
          border-radius: 11px; padding: 9px 12px; font-size: 13px; outline: none; }
        .invnote:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
        .invnote::placeholder { color: var(--ink-3); }

        .empty { text-align: center; padding: 34px 20px; }

        /* Tab-bar — sliding segmented */
        .tabbar { position: fixed; left: 0; right: 0; bottom: 0; max-width: 460px; margin: 0 auto;
          padding: 8px 15px calc(10px + env(safe-area-inset-bottom));
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

        .savebar { position: fixed; left: 0; right: 0; bottom: 0; max-width: 460px; margin: 0 auto;
          padding: 11px 15px calc(13px + env(safe-area-inset-bottom));
          background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(16px); border-top: 1px solid var(--line); z-index: 30; }
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
