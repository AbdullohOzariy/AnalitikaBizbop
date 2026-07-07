"use client";

/**
 * BizbopSotuv Mini App — 2 tab:
 *   📊 Hisobot — davr/filial tanlab KPI, filiallar kesimi (bar), Reja-Fakt, marja.
 *   📦 Inventar — belgilangan SKU'larni sanash: tizim qoldig'i, +/− stepper, farq, saqlash.
 * Auth: Telegram initData ("x-telegram-init-data" header) → /api/miniapp-sotuv/me.
 * Window.Telegram global tipi sverka-app.tsx da e'lon qilingan (declare global).
 */
import { useEffect, useState } from "react";
import { isoDay, todayTashkentISO } from "@/lib/date";
import { formatUZS, formatNumber } from "@/lib/format";

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

export function SotuvApp() {
  const [phase, setPhase] = useState<"loading" | "denied" | "app">("loading");
  const [deniedMsg, setDeniedMsg] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<"hisobot" | "inventar">("hisobot");
  const [tgId, setTgId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    (async () => {
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

  if (phase === "loading") {
    return <Shell><div className="skwrap"><div className="sk h" /><div className="sk r" /><div className="sk r" /><div className="sk c" /></div></Shell>;
  }
  if (phase === "denied" || !me) {
    return (
      <Shell>
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
    <Shell>
      <div className="brandbar">
        <span className="branddot" />
        <b>{tab === "hisobot" ? "BizbopSotuv" : "Inventar"}</b>
        <span className="who"><span className="avatar">{initials(me.name)}</span>{me.name}</span>
      </div>
      {tab === "hisobot" ? <HisobotTab me={me} /> : <InventarTab me={me} />}
      {me.canInventory && (
        <div className="tabbar">
          <button className={`tabbtn ${tab === "hisobot" ? "on" : ""}`} onClick={() => setTab("hisobot")}>📊 Hisobot</button>
          <button className={`tabbtn ${tab === "inventar" ? "on" : ""}`} onClick={() => setTab("inventar")}>📦 Inventar</button>
        </div>
      )}
    </Shell>
  );
}

// ─── 📊 Hisobot ────────────────────────────────────────────────────────────────

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

  const maxBranch = data ? Math.max(1, ...data.branches.map((b) => b.sales)) : 1;

  return (
    <>
      <div className="seg">
        {DAVRLAR.map((d) => (
          <button key={d.key} className={davr === d.key ? "on" : ""} onClick={() => setDavr(d.key)}>{d.label}</button>
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

      {!loading && data && (
        <>
          <div className="hero">
            <div className="lbl">Savdo · {DAVRLAR.find((d) => d.key === davr)?.label.toLowerCase()}</div>
            <div className="heroval">{formatUZS(data.kpi.sales, { compact: true })}</div>
          </div>

          <div className="kpi2">
            <div className="kpi"><div className="lbl">Cheklar</div><div className="v">{formatNumber(data.kpi.receipts)}</div></div>
            <div className="kpi"><div className="lbl">O&apos;rtacha chek</div><div className="v">{formatUZS(data.kpi.avgReceipt, { compact: true })}</div></div>
          </div>

          <div className="card">
            <div className="chead">
              <b>Reja bajarilishi</b>
              <span className={`pct ${data.plan.percent >= 100 ? "good" : "warn"}`}>
                {data.plan.plan > 0 ? `${data.plan.percent.toFixed(1)}%` : "reja yo'q"}
              </span>
            </div>
            <div className="plan"><i style={{ width: `${Math.min(100, data.plan.percent)}%` }} /><span className="target" style={{ left: "100%" }} /></div>
            <div className="planfoot">
              <span>Fakt {formatUZS(data.plan.fakt, { compact: true })}</span>
              <span>Reja {formatUZS(data.plan.plan, { compact: true })}</span>
            </div>
          </div>

          {data.branches.length > 1 && (
            <div className="card">
              <div className="chead"><b>Filiallar kesimi</b><span className="pct muted-c">{data.branches.length} ta</span></div>
              {data.branches.map((b) => (
                <div key={b.id} className="brow">
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
            {data.marja.map((m) => (
              <div key={m.name} className="mrow">
                <span className="mn">{m.name}</span>
                <span className="mv">{formatUZS(m.sales, { compact: true })}</span>
                <span className="mm" style={{ color: m.marja == null ? "var(--ink-3)" : m.marja >= 20 ? "var(--brand-deep)" : m.marja >= 12 ? "var(--ink)" : "var(--surplus)" }}>
                  {m.marja == null ? "—" : `${m.marja.toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── 📦 Inventar ───────────────────────────────────────────────────────────────

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
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setSavedMsg(`✓ ${r.saved} ta SKU saqlandi`);
    } catch (e) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
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
        <p className="statline">Bugun · {items.length} ta SKU · {filled.length} ta kiritildi</p>
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
        const pill = diff == null ? "none" : diff === 0 ? "zero" : diff > 0 ? "surp" : "short";
        const pillText = diff == null ? "—" : diff === 0 ? "✓ mos" : `${diff > 0 ? "+" : ""}${Number(diff.toFixed(3)).toLocaleString("uz-UZ")}`;
        const showNote = (diff != null && diff !== 0) || v.note !== "";
        return (
          <div key={it.productId} className="invcard">
            <div className="invtop">
              <div className="invtitle">
                <div className="invname">{it.name}</div>
                <div className="invmeta">Kod {it.code} · Tizim: <b>{formatNumber(it.systemQty)}</b></div>
              </div>
              <span className={`pill ${pill}`}>{pillText}</span>
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

// ─── Shell + dizayn ──────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      {children}
      <style>{`
        .wrap { max-width: 460px; margin: 0 auto; padding: 8px 15px 96px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
          -webkit-font-smoothing: antialiased; min-height: 100dvh;
          background: var(--tg-theme-bg-color, #F3F6F4); color: var(--tg-theme-text-color, #0C1512);
          --card: var(--tg-theme-secondary-bg-color, #fff);
          --card-2: color-mix(in srgb, var(--tg-theme-secondary-bg-color, #fff) 60%, var(--tg-theme-bg-color, #F3F6F4));
          --ink: var(--tg-theme-text-color, #0C1512);
          --ink-2: color-mix(in srgb, var(--tg-theme-text-color, #0C1512) 62%, var(--tg-theme-hint-color, #8A9C93));
          --ink-3: var(--tg-theme-hint-color, #8A9C93);
          --line: color-mix(in srgb, var(--tg-theme-hint-color, #8A9C93) 26%, transparent);
          --line-2: color-mix(in srgb, var(--tg-theme-hint-color, #8A9C93) 13%, transparent);
          --brand: #10B981; --brand-deep: #0E9C6D; --brand-soft: rgba(16,185,129,.12);
          --shortage: #E5484D; --shortage-soft: rgba(229,72,77,.12);
          --surplus: #EA9A0B; --surplus-soft: rgba(234,154,11,.14);
          --match-soft: rgba(16,185,129,.14);
          --shadow: 0 1px 2px rgba(8,30,20,.05), 0 10px 26px -14px rgba(8,30,20,.20);
          --lift: 0 12px 30px -8px rgba(16,185,129,.42); }

        .brandbar { display: flex; align-items: center; gap: 9px; padding: 14px 2px 12px; }
        .branddot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft); }
        .brandbar b { font-size: 16px; letter-spacing: -.3px; }
        .who { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-3); font-weight: 600; }
        .avatar { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff;
          background: linear-gradient(135deg, var(--brand), var(--brand-deep)); }

        .muted { color: var(--ink-3); font-size: 13px; line-height: 1.5; }
        .small { font-size: 12px; margin-top: 6px; }
        .center { text-align: center; padding: 26px 16px; }
        .statline { color: var(--ink-2); font-size: 12.5px; font-weight: 600; margin: 0 2px 10px; }

        .seg { display: flex; padding: 3px; gap: 2px; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px; margin-bottom: 11px; }
        .seg button { flex: 1; border: 0; background: transparent; color: var(--ink-2); font-size: 13px; font-weight: 600; padding: 9px 0; border-radius: 11px; transition: .18s; }
        .seg button:active { transform: scale(.97); }
        .seg button.on { background: var(--card); color: var(--ink); box-shadow: var(--shadow); }

        .selrow { margin-bottom: 11px; }
        .sel { width: 100%; appearance: none; border: 1px solid var(--line); background: var(--card); color: var(--ink);
          border-radius: 13px; padding: 12px 34px 12px 14px; font-size: 14.5px; font-weight: 600; outline: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%238A9C93' stroke-width='1.6' fill='none' stroke-linecap='round'/></svg>");
          background-repeat: no-repeat; background-position: right 14px center; }
        .sel:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }

        .hero { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 15px 16px; box-shadow: var(--shadow); margin-bottom: 9px; position: relative; overflow: hidden; }
        .hero::after { content: ""; position: absolute; right: -30px; top: -30px; width: 120px; height: 120px; border-radius: 50%; background: var(--brand-soft); pointer-events: none; }
        .hero .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: var(--ink-3); }
        .heroval { font-size: 30px; font-weight: 800; letter-spacing: -.8px; margin-top: 4px; font-variant-numeric: tabular-nums; position: relative; }

        .kpi2 { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-bottom: 11px; }
        .kpi { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 12px 13px; box-shadow: var(--shadow); }
        .kpi .lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--ink-3); }
        .kpi .v { font-size: 19px; font-weight: 800; letter-spacing: -.4px; margin-top: 3px; font-variant-numeric: tabular-nums; }

        .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 14px; box-shadow: var(--shadow); margin-bottom: 11px; }
        .chead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
        .chead b { font-size: 13.5px; letter-spacing: -.1px; }
        .pct { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .pct.good { color: var(--brand-deep); } .pct.warn { color: var(--surplus); } .pct.muted-c { color: var(--ink-3); }

        .plan { position: relative; height: 10px; border-radius: 99px; background: var(--line); margin-bottom: 9px; }
        .plan i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--brand), var(--brand-deep)); transition: width .3s ease; }
        .plan .target { position: absolute; top: -4px; height: 18px; width: 2px; background: var(--ink-3); border-radius: 2px; transform: translateX(-1px); }
        .planfoot { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }

        .brow { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 9px 0; border-top: 1px solid var(--line-2); }
        .brow:first-of-type { border-top: 0; }
        .bn { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bv { font-size: 13.5px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
        .track { grid-column: 1 / -1; height: 6px; border-radius: 99px; background: var(--line-2); overflow: hidden; margin-top: 3px; }
        .track i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--brand), var(--brand-deep)); transition: width .3s ease; }
        .sh { grid-column: 2; font-size: 11px; color: var(--ink-3); font-weight: 700; font-variant-numeric: tabular-nums; }

        .mrow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line-2); font-size: 13.5px; }
        .mrow:first-of-type { border-top: 0; }
        .mn { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mv { font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }
        .mm { width: 54px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }

        .invcard { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 13px 14px; box-shadow: var(--shadow); margin-bottom: 9px; }
        .invtop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
        .invtitle { min-width: 0; }
        .invname { font-size: 14px; font-weight: 700; line-height: 1.25; letter-spacing: -.1px; }
        .invmeta { font-size: 11.5px; color: var(--ink-3); margin-top: 3px; font-variant-numeric: tabular-nums; }
        .invmeta b { color: var(--ink-2); font-weight: 700; }
        .pill { flex: 0 0 auto; font-size: 13px; font-weight: 800; padding: 5px 11px; border-radius: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .pill.short { color: var(--shortage); background: var(--shortage-soft); }
        .pill.surp { color: var(--surplus); background: var(--surplus-soft); }
        .pill.zero { color: var(--brand-deep); background: var(--match-soft); }
        .pill.none { color: var(--ink-3); background: var(--line-2); }

        .counter { display: flex; align-items: stretch; gap: 8px; }
        .counter .step { width: 46px; flex: 0 0 auto; border: 1px solid var(--line); background: var(--card-2); color: var(--ink);
          border-radius: 12px; font-size: 22px; font-weight: 700; line-height: 1; }
        .counter .step:active { transform: scale(.94); background: var(--brand-soft); }
        .counter input { flex: 1; min-width: 0; text-align: center; font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums;
          border: 1.5px solid var(--line); background: var(--card-2); color: var(--ink); border-radius: 12px; padding: 11px 8px; outline: none;
          -moz-appearance: textfield; }
        .counter input::-webkit-outer-spin-button, .counter input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .counter input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
        .counter input.filled { border-color: var(--brand); }
        .invnote { margin-top: 8px; width: 100%; box-sizing: border-box; border: 1px solid var(--line); background: var(--card-2); color: var(--ink);
          border-radius: 11px; padding: 9px 12px; font-size: 13px; outline: none; }
        .invnote:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }

        .empty { text-align: center; padding: 34px 20px; }

        .tabbar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 8px; max-width: 460px; margin: 0 auto;
          padding: 9px 15px calc(11px + env(safe-area-inset-bottom));
          background: color-mix(in srgb, var(--tg-theme-bg-color, #F3F6F4) 88%, transparent); backdrop-filter: blur(14px); border-top: 1px solid var(--line); z-index: 30; }
        .tabbtn { flex: 1; border: 1px solid var(--line); background: var(--card); color: var(--ink-2); font-size: 12.5px; font-weight: 700;
          padding: 12px; border-radius: 13px; transition: .12s; }
        .tabbtn:active { transform: scale(.97); }
        .tabbtn.on { background: linear-gradient(180deg, var(--brand), var(--brand-deep)); color: #fff; border-color: transparent; box-shadow: var(--lift); }

        .savebar { position: fixed; left: 0; right: 0; bottom: 0; max-width: 460px; margin: 0 auto;
          padding: 11px 15px calc(13px + env(safe-area-inset-bottom));
          background: color-mix(in srgb, var(--tg-theme-bg-color, #F3F6F4) 88%, transparent); backdrop-filter: blur(14px); border-top: 1px solid var(--line); z-index: 30; }
        .savebtn { width: 100%; border: 0; border-radius: 15px; padding: 15px; font-size: 15px; font-weight: 800; letter-spacing: -.2px; color: #fff;
          background: linear-gradient(180deg, var(--brand), var(--brand-deep)); box-shadow: var(--lift);
          display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform .12s; }
        .savebtn:active { transform: scale(.98); }
        .savebtn:disabled { opacity: .45; box-shadow: none; }
        .savebtn .cnt { background: rgba(255,255,255,.24); border-radius: 8px; padding: 1px 8px; font-variant-numeric: tabular-nums; }

        .err { color: var(--shortage); font-size: 13px; font-weight: 600; margin: 6px 2px 10px; background: var(--shortage-soft);
          border: 1px solid var(--shortage-soft); border-radius: 12px; padding: 10px 13px; }
        .saved { color: var(--brand-deep); font-size: 13px; font-weight: 700; margin: 6px 2px 10px; background: var(--brand-soft);
          border: 1px solid var(--brand-soft); border-radius: 12px; padding: 10px 13px; }

        .locked { text-align: center; padding: 44px 20px; }
        .lockic { width: 62px; height: 62px; margin: 0 auto 14px; display: grid; place-items: center; font-size: 26px; border-radius: 20px; background: color-mix(in srgb, var(--ink-3) 12%, transparent); }
        .locked h2 { margin: 0 0 6px; font-size: 19px; letter-spacing: -.3px; }
        .idbtn { margin: 16px auto 8px; display: inline-flex; flex-direction: column; align-items: center; gap: 3px; border: 1px solid var(--line);
          background: var(--brand-soft); border-radius: 14px; padding: 12px 22px; color: inherit; }
        .idbtn:active { transform: scale(.97); }
        .idnum { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .5px; }
        .idc { font-size: 11px; color: var(--ink-2); font-weight: 600; }
        h2 { margin: 6px 0; }

        .skwrap { display: flex; flex-direction: column; gap: 9px; padding-top: 4px; }
        .sk { border-radius: 16px; background: linear-gradient(100deg, var(--line-2) 30%, var(--line) 50%, var(--line-2) 70%);
          background-size: 200% 100%; animation: sh 1.3s infinite; }
        .sk.h { height: 82px; } .sk.r { height: 120px; } .sk.c { height: 150px; } .sk.inv { height: 118px; }
        @keyframes sh { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @media (prefers-reduced-motion: reduce) { .sk { animation: none; } .seg button, .tabbtn, .savebtn, .counter .step { transition: none; } }
      `}</style>
    </div>
  );
}
