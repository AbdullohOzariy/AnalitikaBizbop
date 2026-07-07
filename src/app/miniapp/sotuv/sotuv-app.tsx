"use client";

/**
 * BizbopSotuv Mini App — 2 tab:
 *   📊 Hisobot — davr/filial tanlab KPI, filiallar kesimi, Reja-Fakt, marja.
 *   📦 Inventar — belgilangan SKU'larni sanash: tizim qoldig'i, kiritish, farq, saqlash.
 * Auth: Telegram initData ("x-telegram-init-data" header) → /api/miniapp-sotuv/me.
 * Window.Telegram global tipi sverka-app.tsx da e'lon qilingan (declare global) —
 * shu deklaratsiyadan foydalanamiz, dublikat e'lon qilinmaydi.
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

export function SotuvApp() {
  const [phase, setPhase] = useState<"loading" | "denied" | "app">("loading");
  const [deniedMsg, setDeniedMsg] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<"hisobot" | "inventar">("hisobot");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    (async () => {
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

  if (phase === "loading") return <Shell><p className="muted center">Yuklanmoqda…</p></Shell>;
  if (phase === "denied" || !me) {
    return (
      <Shell>
        <div className="card center">
          <div className="lockic">🔒</div>
          <h2>Kirish yo&apos;q</h2>
          <p className="muted">{deniedMsg || "Hisobingiz platformaga bog'lanmagan. Admin bilan bog'laning."}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="hello">👋 {me.name}</p>
      {tab === "hisobot" ? <HisobotTab me={me} /> : <InventarTab me={me} />}
      {me.canInventory && (
        <div className="tabs">
          <button className={`tabbtn ${tab === "hisobot" ? "on" : ""}`} onClick={() => setTab("hisobot")}>
            📊 Hisobot
          </button>
          <button className={`tabbtn ${tab === "inventar" ? "on" : ""}`} onClick={() => setTab("inventar")}>
            📦 Inventar
          </button>
        </div>
      )}
    </Shell>
  );
}

// ─── 📊 Hisobot ────────────────────────────────────────────────────────────────

function HisobotTab({ me }: { me: MeUser }) {
  const single = me.branches.length === 1;
  const [davr, setDavr] = useState<Davr>("bugun");
  // 0 = Jami (barcha qamrov filiallari); bitta filial bo'lsa avto-tanlangan.
  const [branchId, setBranchId] = useState<number>(single ? me.branches[0].id : 0);
  // Holat kalit bilan saqlanadi — "loading" render'da derive qilinadi (effektda sync setState yo'q).
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

  return (
    <>
      <div className="chips">
        {DAVRLAR.map((d) => (
          <button key={d.key} className={`chip ${davr === d.key ? "on" : ""}`} onClick={() => setDavr(d.key)}>
            {d.label}
          </button>
        ))}
      </div>

      {!single && (
        <select className="inp sel" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
          {me.branches.length > 1 && <option value={0}>Jami (barcha filiallar)</option>}
          {me.branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}

      {err && <p className="err">{err}</p>}
      {loading && <p className="muted center">Yuklanmoqda…</p>}

      {!loading && data && (
        <>
          <div className="kpis">
            <div className="kpi big">
              <small>Savdo</small>
              <b>{formatUZS(data.kpi.sales, { compact: true })}</b>
            </div>
            <div className="kpi">
              <small>Cheklar</small>
              <b>{formatNumber(data.kpi.receipts)}</b>
            </div>
            <div className="kpi">
              <small>O&apos;rtacha chek</small>
              <b>{formatUZS(data.kpi.avgReceipt, { compact: true })}</b>
            </div>
          </div>

          <div className="card sect">
            <div className="secthead">
              <b>Reja-Fakt</b>
              <span className={data.plan.percent >= 100 ? "ok" : "warn"}>
                {data.plan.plan > 0 ? `${data.plan.percent.toFixed(1)}%` : "reja yo'q"}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.min(100, data.plan.percent)}%` }} />
            </div>
            <p className="muted small">
              Fakt {formatUZS(data.plan.fakt, { compact: true })} · Reja {formatUZS(data.plan.plan, { compact: true })}
            </p>
          </div>

          {data.branches.length > 1 && (
            <div className="card sect">
              <div className="secthead"><b>Filiallar</b></div>
              {data.branches.map((b) => (
                <div key={b.id} className="row">
                  <span className="rname">{b.name}</span>
                  <span className="rval">{formatUZS(b.sales, { compact: true })}</span>
                  <span className="rshare">{b.share.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="card sect">
            <div className="secthead"><b>Marja (guruhlar)</b></div>
            {data.marja.length === 0 && <p className="muted">Ma&apos;lumot yo&apos;q</p>}
            {data.marja.map((m) => (
              <div key={m.name} className="row">
                <span className="rname">{m.name}</span>
                <span className="rval">{formatUZS(m.sales, { compact: true })}</span>
                <span className="rshare">{m.marja == null ? "—" : `${m.marja.toFixed(1)}%`}</span>
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
  // Yuklangan ro'yxat kalit (filial) bilan saqlanadi — "loading" render'da derive qilinadi.
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
        const r = await api<{ ok: true; sanaKuni: string; items: InvItem[] }>(
          `/api/miniapp-sotuv/inventar?branchId=${branchId}`
        );
        if (cancelled) return;
        // Bugungi kiritilganlar oldindan to'ldiriladi (davomiy tahrirlash).
        const v: Record<number, EditVal> = {};
        for (const it of r.items) {
          v[it.productId] = { qty: it.countedQty == null ? "" : String(it.countedQty), note: it.note ?? "" };
        }
        setVals(v);
        setErr(""); setSavedMsg("");
        setRes({ branchId, items: r.items, err: "" });
      } catch (e) {
        if (!cancelled) {
          setRes({ branchId, items: [], err: e instanceof Error ? e.message : "Xatolik yuz berdi" });
        }
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
          return {
            productId: it.productId,
            countedQty: Number(v.qty),
            ...(v.note.trim() ? { note: v.note.trim() } : {}),
          };
        }),
      };
      const r = await api<{ ok: true; saved: number }>("/api/miniapp-sotuv/inventar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      {me.branches.length > 1 && (
        <select className="inp sel" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
          {me.branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}
      {me.branches.length === 1 && <p className="muted small">Filial: {me.branches[0].name}</p>}

      {(loadErr || err) && <p className="err">{loadErr || err}</p>}
      {savedMsg && <p className="saved">{savedMsg}</p>}
      {loading && <p className="muted center">Yuklanmoqda…</p>}

      {!loading && !loadErr && items.length === 0 && (
        <div className="card center"><p className="muted">Inventar ro&apos;yxati bo&apos;sh — SKU platformada belgilanadi.</p></div>
      )}

      {!loading && items.map((it) => {
        const v = vals[it.productId] ?? { qty: "", note: "" };
        const num = v.qty.trim() === "" ? null : Number(v.qty);
        const diff = num != null && Number.isFinite(num) ? num - it.systemQty : null;
        return (
          <div key={it.productId} className="card inv">
            <div className="invhead">
              <div>
                <b className="invname">{it.name}</b>
                <p className="muted small">Kod: {it.code} · Tizim: {formatNumber(it.systemQty)}</p>
              </div>
              {diff != null && (
                <span className={`diff ${diff === 0 ? "zero" : diff > 0 ? "plus" : "minus"}`}>
                  {diff > 0 ? "+" : ""}{Number(diff.toFixed(3)).toLocaleString("uz-UZ")}
                </span>
              )}
            </div>
            <input
              type="number" inputMode="decimal" min={0} className="inp"
              placeholder="Sanaldi…"
              value={v.qty}
              onChange={(e) => setVal(it.productId, { qty: e.target.value })}
            />
            {(diff != null && diff !== 0) || v.note ? (
              <input
                className="inp note" placeholder="Izoh (masalan kamomad sababi)…" maxLength={500}
                value={v.note}
                onChange={(e) => setVal(it.productId, { note: e.target.value })}
              />
            ) : null}
          </div>
        );
      })}

      {!loading && items.length > 0 && (
        <button className="btn save" disabled={saving || filled.length === 0} onClick={save}>
          {saving ? "Saqlanmoqda…" : `✅ Saqlash (${filled.length} ta)`}
        </button>
      )}
    </>
  );
}

// ─── Shell (sverka-app dizayn tili: emerald, tg-tema) ─────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="brandbar">
        <span className="branddot" />
        <b>BizbopSotuv</b>
        <small>BizBop</small>
      </header>
      {children}
      <style>{`
        .wrap { max-width: 440px; margin: 0 auto; padding: 0 16px 96px;
          font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-theme-bg-color, #F2F3F7); color: var(--tg-theme-text-color, #0B0B0F);
          min-height: 100dvh;
          --brand: #1FBF5C; --brand4: #3DD17A; --brand6: #15A34A; --line: rgba(130,130,140,.16); }
        .brandbar { display: flex; align-items: center; gap: 9px; padding: 16px 2px 10px; }
        .brandbar b { font-family: Sora, -apple-system, sans-serif; font-size: 17px; letter-spacing: -.3px; }
        .brandbar small { margin-left: auto; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .6px; color: var(--tg-theme-hint-color, #8A8A8E); }
        .branddot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand);
          box-shadow: 0 0 0 4px rgba(31,191,92,.15); }
        .hello { margin: 0 2px 10px; font-size: 13px; font-weight: 600;
          color: var(--tg-theme-hint-color, #8A8A8E); }
        .card { background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line);
          border-radius: 18px; padding: 14px;
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10); }
        .center { text-align: center; padding: 30px 16px; }
        .muted { color: var(--tg-theme-hint-color, #8A8A8E); font-size: 13px; line-height: 1.45; }
        .small { font-size: 12px; margin: 4px 0 0; }
        .lockic { width: 64px; height: 64px; margin: 0 auto 12px; display: flex; align-items: center;
          justify-content: center; font-size: 28px; border-radius: 20px; background: rgba(130,130,140,.10); }
        .chips { display: flex; gap: 7px; margin-bottom: 10px; }
        .chip { flex: 1; font-size: 13px; font-weight: 600; padding: 9px 12px; border-radius: 999px;
          border: 1px solid var(--line); background: var(--tg-theme-secondary-bg-color, #fff); color: inherit;
          transition: transform .1s; }
        .chip:active { transform: scale(.96); }
        .chip.on { background: linear-gradient(180deg, var(--brand4), var(--brand6)); color: #fff;
          border-color: transparent; box-shadow: 0 8px 24px -6px rgba(31,191,92,.40); }
        .inp { width: 100%; box-sizing: border-box; font-size: 16px; padding: 12px 14px;
          border-radius: 14px; border: 1px solid var(--line);
          background: var(--tg-theme-secondary-bg-color, #fff); color: inherit; outline: none;
          transition: border-color .15s, box-shadow .15s; }
        .inp:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(31,191,92,.15); }
        .sel { margin-bottom: 10px; appearance: none; }
        .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
        .kpi { background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line);
          border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
        .kpi.big { grid-column: 1 / -1; }
        .kpi small { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
          color: var(--tg-theme-hint-color, #8A8A8E); }
        .kpi b { font-family: Sora, -apple-system, sans-serif; font-size: 19px; letter-spacing: -.4px; }
        .kpi.big b { font-size: 26px; color: var(--brand6); }
        .sect { margin-bottom: 10px; }
        .secthead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .secthead b { font-size: 14px; }
        .secthead .ok { color: var(--brand6); font-weight: 700; font-size: 13px; }
        .secthead .warn { color: #D97706; font-weight: 700; font-size: 13px; }
        .bar { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; }
        .bar i { display: block; height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, var(--brand4), var(--brand6)); transition: width .25s ease; }
        .row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-top: 1px solid var(--line);
          font-size: 13.5px; }
        .row:first-of-type { border-top: none; }
        .rname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rval { font-weight: 700; }
        .rshare { width: 52px; text-align: right; color: var(--tg-theme-hint-color, #8A8A8E); font-weight: 600; }
        .inv { margin-bottom: 8px; }
        .invhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
          margin-bottom: 8px; }
        .invname { font-size: 14px; line-height: 1.3; }
        .diff { flex: 0 0 auto; font-weight: 800; font-size: 14px; padding: 4px 10px; border-radius: 10px; }
        .diff.zero { color: var(--tg-theme-hint-color, #8A8A8E); background: rgba(130,130,140,.10); }
        .diff.plus { color: var(--brand6); background: rgba(31,191,92,.12); }
        .diff.minus { color: #DC2626; background: rgba(220,38,38,.10); }
        .note { margin-top: 8px; font-size: 13px; padding: 9px 12px; }
        .btn { width: 100%; font-size: 15.5px; font-weight: 700; letter-spacing: -.2px; padding: 15px;
          border-radius: 16px; border: none; color: #fff;
          background: linear-gradient(180deg, var(--brand4), var(--brand6));
          box-shadow: 0 8px 24px -6px rgba(31,191,92,.40); transition: transform .12s, box-shadow .12s; }
        .btn:active { transform: scale(.97); }
        .btn:disabled { opacity: .4; box-shadow: none; }
        .btn.save { margin-top: 4px; }
        .tabs { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px;
          max-width: 440px; margin: 0 auto; padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
          background: var(--tg-theme-bg-color, #F2F3F7); border-top: 1px solid var(--line); }
        .tabbtn { flex: 1; font-size: 14px; font-weight: 700; padding: 13px; border-radius: 14px;
          border: 1px solid var(--line); background: var(--tg-theme-secondary-bg-color, #fff); color: inherit;
          transition: transform .1s; }
        .tabbtn:active { transform: scale(.97); }
        .tabbtn.on { background: linear-gradient(180deg, var(--brand4), var(--brand6)); color: #fff;
          border-color: transparent; box-shadow: 0 8px 24px -6px rgba(31,191,92,.40); }
        .err { color: #DC2626; font-size: 13px; font-weight: 500; margin: 10px 2px;
          background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.25);
          border-radius: 12px; padding: 10px 13px; }
        .saved { color: var(--brand6); font-size: 13px; font-weight: 700; margin: 10px 2px;
          background: rgba(31,191,92,.10); border: 1px solid rgba(31,191,92,.25);
          border-radius: 12px; padding: 10px 13px; }
        h2 { margin: 6px 0; font-family: Sora, -apple-system, sans-serif; font-size: 20px; letter-spacing: -.4px; }
      `}</style>
    </div>
  );
}
