"use client";

/**
 * Kassa mini app — telefondan kirim/chiqim kiritish.
 *
 * Barcha biznes qoidalari SERVERDA (src/lib/moliya/yozuv.ts) — bu ekran faqat
 * qulaylik uchun oldindan ogohlantiradi (yopilgan kun, yo'nalish qulfi, yirik
 * summada kontragent). Server baribir qayta tekshiradi.
 */
import { useEffect, useMemo, useState } from "react";

type Account = { id: number; name: string; kind: string };
type Article = {
  id: number;
  name: string;
  direction: string;
  isNeutral: boolean;
  group: string;
  section: string;
};
type Ref = { id: number; name: string; kind?: string };

type Malumot = {
  ok: true;
  user: { name: string };
  bugun: string;
  accounts: Account[];
  articles: Article[];
  counterparties: Ref[];
  costCenters: Ref[];
  closed: { accountId: number; onDate: string }[];
};

type Holat =
  | { t: "loading" }
  | { t: "error"; msg: string }
  | { t: "ready"; d: Malumot };

const SECTION_LABEL: Record<string, string> = {
  OPERATING: "Operatsion",
  INVESTING: "Investitsion",
  FINANCING: "Moliyaviy",
  TECHNICAL: "Texnik",
};

const LARGE_HINT = 5_000_000;

function initData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

const uz = (n: number) => new Intl.NumberFormat("uz-UZ").format(n);

export function MoliyaApp() {
  const [st, setSt] = useState<Holat>({ t: "loading" });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    (async () => {
      try {
        const r = await fetch("/api/miniapp-moliya/malumot", {
          headers: { "x-telegram-init-data": initData() },
        });
        const j = await r.json();
        if (!r.ok || !j.ok) return setSt({ t: "error", msg: j.xato ?? "Ulanib bo'lmadi." });
        setSt({ t: "ready", d: j as Malumot });
      } catch {
        setSt({ t: "error", msg: "Ulanib bo'lmadi. Internetni tekshiring." });
      }
    })();
  }, []);

  return (
    <div className="wrap">
      <header className="bar">
        <span className="dot" />
        <b>Kassa</b>
        {st.t === "ready" && <small>{st.d.user.name}</small>}
      </header>

      {st.t === "loading" && (
        <div className="center">
          <div className="spin" />
          <p className="muted">Yuklanmoqda…</p>
        </div>
      )}

      {st.t === "error" && (
        <div className="card center">
          <div className="lock">🔒</div>
          <h2>Kirish yo&apos;q</h2>
          <p className="muted">{st.msg}</p>
        </div>
      )}

      {st.t === "ready" && <Forma d={st.d} />}

      <style>{`
        body { background: var(--tg-theme-bg-color, #F2F3F7); }
        .wrap { min-height: 100dvh; max-width: 440px; margin: 0 auto; padding: 0 16px 28px;
          font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-theme-bg-color, #F2F3F7); color: var(--tg-theme-text-color, #0B0B0F);
          --brand: #1FBF5C; --brand-deep: #0B7A38; --red: #E5484D;
          --line: rgba(130,130,140,.16); }
        .bar { display: flex; align-items: center; gap: 9px; padding: 16px 2px 14px; }
        .bar b { font-size: 17px; letter-spacing: -.3px; }
        .bar small { margin-left: auto; font-size: 12px; color: var(--tg-theme-hint-color, #8A8A8E); }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand);
          box-shadow: 0 0 0 4px rgba(31,191,92,.15); }
        .center { text-align: center; padding: 48px 16px; }
        .muted { color: var(--tg-theme-hint-color, #8A8A8E); font-size: 13.5px; line-height: 1.45; }
        .card { background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line);
          border-radius: 16px; padding: 18px; }
        .lock { font-size: 34px; margin-bottom: 8px; }
        .spin { width: 26px; height: 26px; margin: 0 auto 12px; border-radius: 50%;
          border: 3px solid var(--line); border-top-color: var(--brand); animation: sp .8s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }

        .f { margin-bottom: 13px; }
        .f > label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;
          color: var(--tg-theme-hint-color, #8A8A8E); }
        .f input, .f select, .f textarea { width: 100%; box-sizing: border-box; font-size: 16px;
          padding: 12px 13px; border-radius: 12px; border: 1px solid var(--line);
          background: var(--tg-theme-secondary-bg-color, #fff); color: inherit;
          font-family: inherit; -webkit-appearance: none; }
        .f input:focus, .f select:focus, .f textarea:focus { outline: 2px solid var(--brand); outline-offset: -1px; }
        .amount { font-size: 22px !important; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }

        .seg { display: flex; gap: 8px; }
        .seg button { flex: 1; padding: 13px 0; border-radius: 12px; border: 1px solid var(--line);
          background: var(--tg-theme-secondary-bg-color, #fff); color: inherit; font-size: 15px;
          font-weight: 600; font-family: inherit; }
        .seg button[disabled] { opacity: .35; }
        .seg button.on-in { background: var(--brand); border-color: var(--brand); color: #fff; }
        .seg button.on-out { background: var(--red); border-color: var(--red); color: #fff; }

        .note { display: flex; gap: 7px; padding: 10px 12px; border-radius: 11px; font-size: 12.5px;
          line-height: 1.4; margin-bottom: 13px; }
        .note.warn { background: rgba(245,158,11,.12); color: #92400E; }
        .note.info { background: rgba(168,85,247,.12); color: #6B21A8; }
        .note.bad { background: rgba(229,72,77,.12); color: #9B1C20; }

        .save { position: sticky; bottom: 0; padding: 12px 0 max(12px, env(safe-area-inset-bottom));
          background: linear-gradient(to top, var(--tg-theme-bg-color, #F2F3F7) 62%, transparent); }
        .save button { width: 100%; padding: 15px; border-radius: 14px; border: 0; font-size: 16.5px;
          font-weight: 700; font-family: inherit; background: var(--brand); color: #fff; }
        .save button[disabled] { opacity: .45; }

        .okc { text-align: center; padding: 36px 16px; }
        .okc .tick { font-size: 44px; }
      `}</style>
    </div>
  );
}

function Forma({ d }: { d: Malumot }) {
  const [sana, setSana] = useState(d.bugun);
  const [accountId, setAccountId] = useState(d.accounts[0]?.id ?? 0);
  const [articleId, setArticleId] = useState(0);
  const [dir, setDir] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [cpId, setCpId] = useState(0);
  const [ccId, setCcId] = useState(0);
  const [note, setNote] = useState("");
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [muvaffaq, setMuvaffaq] = useState(false);

  const article = d.articles.find((a) => a.id === articleId);
  const qulf = article?.direction === "IN_ONLY" ? "IN" : article?.direction === "OUT_ONLY" ? "OUT" : null;
  const yonalish = qulf ?? dir;

  const kunYopiq = d.closed.some((c) => c.accountId === accountId && c.onDate === sana);
  const summa = Number(amount.replace(/\D/g, "")) || 0;
  const kontragentShart = summa >= LARGE_HINT && !cpId;

  const grouped = useMemo(() => {
    const m = new Map<string, Article[]>();
    for (const a of d.articles) {
      const k = `${SECTION_LABEL[a.section] ?? a.section} · ${a.group}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return [...m];
  }, [d.articles]);

  const tayyor = accountId > 0 && articleId > 0 && summa > 0 && !kunYopiq && !kontragentShart;

  const saqla = async () => {
    setSaqlanmoqda(true);
    setXato(null);
    try {
      const r = await fetch("/api/miniapp-moliya/yozuv", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-telegram-init-data": initData() },
        body: JSON.stringify({
          businessDate: sana,
          accountId,
          articleId,
          direction: yonalish,
          amount: summa,
          counterpartyId: cpId || null,
          costCenterId: ccId || null,
          note: note.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setXato(j.xato ?? "Saqlanmadi.");
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      } else {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
        setMuvaffaq(true);
      }
    } catch {
      setXato("Tarmoq xatosi. Qayta urinib ko'ring.");
    } finally {
      setSaqlanmoqda(false);
    }
  };

  if (muvaffaq) {
    return (
      <div className="card okc">
        <div className="tick">✅</div>
        <h2>Saqlandi</h2>
        <p className="muted">
          {yonalish === "IN" ? "Kirim" : "Chiqim"} {uz(summa)} so&apos;m
        </p>
        <div className="save">
          <button
            onClick={() => {
              setMuvaffaq(false);
              setAmount("");
              setNote("");
              setCpId(0);
            }}
          >
            Yana kiritish
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="f">
        <label>Sana</label>
        <input type="date" value={sana} max={d.bugun} onChange={(e) => setSana(e.target.value)} />
      </div>

      <div className="f">
        <label>Hisob</label>
        <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
          {d.accounts.length === 0 && <option value={0}>— hisob biriktirilmagan —</option>}
          {d.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {kunYopiq && (
        <div className="note bad">
          🔒 Bu kun shu hisob bo&apos;yicha yopilgan — yozuv kiritib bo&apos;lmaydi. Boshqa sana tanlang.
        </div>
      )}

      <div className="f">
        <label>Modda</label>
        <select value={articleId} onChange={(e) => setArticleId(Number(e.target.value))}>
          <option value={0}>— tanlang —</option>
          {grouped.map(([g, arts]) => (
            <optgroup key={g} label={g}>
              {arts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {article?.isNeutral && (
        <div className="note info">
          ⚪ Neytral modda — daromad/xarajat hisobotiga kirmaydi.
        </div>
      )}

      <div className="f">
        <label>Yo&apos;nalish</label>
        <div className="seg">
          <button
            className={yonalish === "IN" ? "on-in" : ""}
            disabled={qulf === "OUT"}
            onClick={() => setDir("IN")}
          >
            ↓ Kirim
          </button>
          <button
            className={yonalish === "OUT" ? "on-out" : ""}
            disabled={qulf === "IN"}
            onClick={() => setDir("OUT")}
          >
            ↑ Chiqim
          </button>
        </div>
        {qulf && (
          <p className="muted" style={{ marginTop: 5, fontSize: 12 }}>
            Bu modda faqat {qulf === "IN" ? "kirim" : "chiqim"} uchun
          </p>
        )}
      </div>

      <div className="f">
        <label>Summa (so&apos;m)</label>
        <input
          className="amount"
          inputMode="numeric"
          value={amount ? uz(summa) : ""}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="f">
        <label>Kontragent {kontragentShart && "— majburiy"}</label>
        <select value={cpId} onChange={(e) => setCpId(Number(e.target.value))}>
          <option value={0}>— yo&apos;q —</option>
          {d.counterparties.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {kontragentShart && (
        <div className="note warn">
          ⚠️ {uz(LARGE_HINT)} so&apos;mdan katta summada kontragent ko&apos;rsatilishi shart.
        </div>
      )}

      <div className="f">
        <label>Xarajat markazi</label>
        <select value={ccId} onChange={(e) => setCcId(Number(e.target.value))}>
          <option value={0}>— yo&apos;q —</option>
          {d.costCenters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.kind === "PROJECT" ? " (loyiha)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="f">
        <label>Izoh</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {xato && <div className="note bad">⚠️ {xato}</div>}

      <div className="save">
        <button disabled={!tayyor || saqlanmoqda} onClick={saqla}>
          {saqlanmoqda ? "Saqlanmoqda…" : "Saqlash"}
        </button>
      </div>
    </>
  );
}
