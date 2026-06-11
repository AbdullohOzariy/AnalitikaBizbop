"use client";

/**
 * Sverka Mini App — qadamma-qadam kiritish:
 * Sana → Firma (bazadan qidirib) → Sklad → Kontragent → Dagavor → Summa + rasm.
 * Rasm /api/rasm-yukla orqali Telegram'ga yuklanadi (file_id), yozuv /api/sverka/yozuv.
 */
import { useEffect, useRef, useState } from "react";

type TgWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  HapticFeedback?: { notificationOccurred: (t: "success" | "error" | "warning") => void };
};
declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

type Firma = { id: number; name: string };
type Luglar = { sklad: string[]; kontragent: string[]; dagavor: string[] };

const STEPS = ["Sana", "Firma", "Sklad", "Kontragent", "Dagavor", "Summa va rasm"] as const;

function todayStr(): string {
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
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

/** Rasmni telefon kamerasidan kichraytirib JPEG qiladi (tez yuklash uchun). */
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function SverkaApp() {
  const [phase, setPhase] = useState<"loading" | "denied" | "form" | "done">("loading");
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");

  // Maydonlar
  const [sana, setSana] = useState(todayStr);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [firmaQ, setFirmaQ] = useState("");
  const [firmaOpts, setFirmaOpts] = useState<Firma[]>([]);
  const [sklad, setSklad] = useState("");
  const [kontragent, setKontragent] = useState("");
  const [kontrQ, setKontrQ] = useState("");
  const [kontrOpts, setKontrOpts] = useState<Firma[]>([]);
  const kontrDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dagavor, setDagavor] = useState("");
  const [summa, setSumma] = useState("");
  const [rasm, setRasm] = useState<File | null>(null);
  const [luglar, setLuglar] = useState<Luglar>({ sklad: [], kontragent: [], dagavor: [] });
  const [sending, setSending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Telegram tayyorlash + ruxsat
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    (async () => {
      try {
        const r = await api<{ allowed: boolean }>("/api/sverka/ruxsat", { method: "POST" });
        if (r.allowed) { setPhase("form"); return; }
        // Sverka ruxsati yo'q — spisaniya roli bo'lsa o'sha appga o'tamiz
        try {
          const s = await api<{ allowed: boolean }>("/api/ruxsat", { method: "POST" });
          if (s.allowed) { window.location.replace("/miniapp/index.html?via=kirish" + window.location.hash); return; }
        } catch { /* jim */ }
        setPhase("denied");
      } catch { setPhase("denied"); }
    })();
  }, []);

  // Firma qidiruvi (debounce) — bo'sh bo'lsa eng faollar
  useEffect(() => {
    if (phase !== "form") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api<{ firmalar: Firma[] }>(`/api/sverka/firmalar?q=${encodeURIComponent(firmaQ)}`);
        setFirmaOpts(r.firmalar);
      } catch { /* jim */ }
    }, 250);
  }, [firmaQ, phase]);

  // Kontragent qidiruvi — yetkazib beruvchilar ro'yxatidan (firma kabi)
  useEffect(() => {
    if (phase !== "form") return;
    if (kontrDebounce.current) clearTimeout(kontrDebounce.current);
    kontrDebounce.current = setTimeout(async () => {
      try {
        const r = await api<{ firmalar: Firma[] }>(`/api/sverka/firmalar?q=${encodeURIComponent(kontrQ)}`);
        setKontrOpts(r.firmalar);
      } catch { /* jim */ }
    }, 250);
  }, [kontrQ, phase]);

  // Lug'atlar — firma tanlangach (dagavor takliflari firma bo'yicha)
  useEffect(() => {
    if (phase !== "form") return;
    (async () => {
      try {
        const r = await api<Luglar>(`/api/sverka/luglar?supplierId=${firma?.id ?? 0}`);
        setLuglar(r);
      } catch { /* jim */ }
    })();
  }, [firma, phase]);

  const canNext = [
    /^\d{4}-\d{2}-\d{2}$/.test(sana),
    firma != null,
    sklad.trim().length > 0,
    kontragent.trim().length > 0,
    dagavor.trim().length > 0,
    Number(summa) > 0 && rasm != null,
  ][step];

  const submit = async () => {
    if (sending) return;
    setSending(true); setErr("");
    try {
      // 1) Rasm → file_id
      const blob = await compressImage(rasm!);
      const fd = new FormData();
      fd.append("rasm", blob, "nakladnoy.jpg");
      const up = await api<{ file_id: string }>("/api/rasm-yukla", { method: "POST", body: fd });
      // 2) Yozuv
      await api("/api/sverka/yozuv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sana, supplierId: firma!.id, firmaNomi: firma!.name,
          sklad: sklad.trim(), kontragent: kontragent.trim(), dagavor: dagavor.trim(),
          summa: Number(summa), rasmFileId: up.file_id,
        }),
      });
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setPhase("done");
    } catch (e) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      setErr(e instanceof Error ? e.message : "Xatolik — qayta urinib ko'ring.");
    } finally { setSending(false); }
  };

  const resetForNew = () => {
    setStep(0); setFirma(null); setFirmaQ(""); setSklad(""); setKontragent(""); setKontrQ(""); setKontrOpts([]);
    setDagavor(""); setSumma(""); setRasm(null); setErr(""); setPhase("form");
    setSana(todayStr());
  };

  // ── Ekranlar ──
  if (phase === "loading") return <Shell><p className="muted center">Yuklanmoqda…</p></Shell>;
  if (phase === "denied") {
    return (
      <Shell>
        <div className="card center">
          <p style={{ fontSize: 40 }}>🔒</p>
          <h2>Ruxsat yo&apos;q</h2>
          <p className="muted">Botga /start yozib, ID raqamingizni adminga yuboring.</p>
        </div>
      </Shell>
    );
  }
  if (phase === "done") {
    return (
      <Shell>
        <div className="card center">
          <p style={{ fontSize: 44 }}>✅</p>
          <h2>Sverka saqlandi!</h2>
          <p className="muted">{firma?.name} · {Number(summa).toLocaleString("uz-UZ")} so&apos;m</p>
          <button className="btn" onClick={resetForNew}>➕ Yana kiritish</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Qadam ko'rsatkichi */}
      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`dot ${i < step ? "ok" : i === step ? "cur" : ""}`} />
        ))}
      </div>
      <p className="step-title">{step + 1}/{STEPS.length} · {STEPS[step]}</p>

      <div className="card">
        {step === 0 && (
          <input type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="inp" />
        )}

        {step === 1 && (
          <>
            <input
              value={firma ? firma.name : firmaQ}
              onChange={(e) => { setFirma(null); setFirmaQ(e.target.value); }}
              placeholder="Firma nomini yozing… (masalan: Agr)"
              className="inp"
              autoFocus
            />
            {!firma && (
              <div className="opts">
                {firmaOpts.map((f) => (
                  <button key={f.id} className="opt" onClick={() => { setFirma(f); }}>
                    {f.name}
                  </button>
                ))}
                {firmaOpts.length === 0 && firmaQ && <p className="muted">Topilmadi — boshqacha yozib ko&apos;ring</p>}
              </div>
            )}
            {firma && <p className="picked">✓ {firma.name}</p>}
          </>
        )}

        {step === 2 && (
          <FieldWithChips value={sklad} onChange={setSklad} placeholder="Sklad nomi…" chips={luglar.sklad} />
        )}
        {step === 3 && (
          <>
            <input
              value={kontragent || kontrQ}
              onChange={(e) => { setKontragent(""); setKontrQ(e.target.value); }}
              placeholder="Kontragent nomini yozing…"
              className="inp"
              autoFocus
            />
            {!kontragent && (
              <div className="opts">
                {kontrOpts.map((f) => (
                  <button key={f.id} className="opt" onClick={() => setKontragent(f.name)}>
                    {f.name}
                  </button>
                ))}
                {kontrOpts.length === 0 && kontrQ && <p className="muted">Topilmadi — boshqacha yozib ko&apos;ring</p>}
              </div>
            )}
            {kontragent && <p className="picked">✓ {kontragent}</p>}
          </>
        )}
        {step === 4 && (
          <FieldWithChips value={dagavor} onChange={setDagavor} placeholder="Dagavor raqami/nomi…" chips={luglar.dagavor} />
        )}

        {step === 5 && (
          <>
            <input type="number" inputMode="decimal" value={summa} onChange={(e) => setSumma(e.target.value)}
              placeholder="Summa (so'm)" className="inp" autoFocus />
            <label className="file">
              {rasm ? `📎 ${rasm.name || "rasm tanlandi"} ✓` : "📷 Nakladnoy rasmini biriktirish"}
              <input type="file" accept="image/*" hidden
                onChange={(e) => setRasm(e.target.files?.[0] ?? null)} />
            </label>
            {/* Tekshiruv xulosasi */}
            <div className="summary">
              <p>{sana} · <b>{firma?.name}</b></p>
              <p className="muted">{sklad} → {kontragent} · {dagavor}</p>
            </div>
          </>
        )}
      </div>

      {err && <p className="err">{err}</p>}

      <div className="nav">
        {step > 0 && <button className="btn ghost" onClick={() => setStep((s) => s - 1)}>← Orqaga</button>}
        {step < STEPS.length - 1 ? (
          <button className="btn" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Keyingi →</button>
        ) : (
          <button className="btn" disabled={!canNext || sending} onClick={submit}>
            {sending ? "Yuborilmoqda…" : "✅ Saqlash"}
          </button>
        )}
      </div>
    </Shell>
  );
}

function FieldWithChips({ value, onChange, placeholder, chips }: {
  value: string; onChange: (v: string) => void; placeholder: string; chips: string[];
}) {
  return (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="inp" autoFocus />
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <button key={c} className={`chip ${value === c ? "on" : ""}`} onClick={() => onChange(c)}>{c}</button>
          ))}
        </div>
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="head">📑 Sverka kiritish</header>
      {children}
      {/* Telegram mavzusiga mos sodda uslub — global CSS'ga bog'lanmaydi */}
      <style>{`
        .wrap { max-width: 480px; margin: 0 auto; padding: 14px 14px 90px;
          font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111);
          min-height: 100dvh; }
        .head { font-size: 17px; font-weight: 700; padding: 4px 2px 12px; }
        .card { background: var(--tg-theme-secondary-bg-color, #f3f4f6); border-radius: 14px; padding: 14px; }
        .center { text-align: center; padding: 28px 14px; }
        .muted { color: var(--tg-theme-hint-color, #6b7280); font-size: 13px; }
        .inp { width: 100%; box-sizing: border-box; font-size: 16px; padding: 12px;
          border-radius: 10px; border: 1px solid rgba(128,128,128,.35);
          background: var(--tg-theme-bg-color, #fff); color: inherit; }
        .opts { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; max-height: 290px; overflow-y: auto; }
        .opt { text-align: left; font-size: 14px; padding: 10px 12px; border-radius: 10px;
          border: 1px solid rgba(128,128,128,.25); background: var(--tg-theme-bg-color, #fff); color: inherit; }
        .picked { margin: 10px 2px 0; font-weight: 600; color: #059669; }
        .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { font-size: 12px; padding: 7px 10px; border-radius: 999px;
          border: 1px solid rgba(128,128,128,.3); background: var(--tg-theme-bg-color, #fff); color: inherit; }
        .chip.on { background: #059669; color: #fff; border-color: #059669; }
        .file { display: block; margin-top: 10px; text-align: center; font-size: 14px; font-weight: 600;
          padding: 13px; border-radius: 10px; border: 1.5px dashed rgba(128,128,128,.45); cursor: pointer; }
        .summary { margin-top: 12px; font-size: 13px; line-height: 1.5; }
        .summary p { margin: 2px 0; }
        .steps { display: flex; gap: 5px; margin-bottom: 6px; }
        .dot { height: 4px; flex: 1; border-radius: 2px; background: rgba(128,128,128,.25); }
        .dot.ok { background: #059669; }
        .dot.cur { background: #34d399; }
        .step-title { font-size: 13px; font-weight: 600; margin: 0 0 8px;
          color: var(--tg-theme-hint-color, #6b7280); }
        .nav { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px;
          max-width: 480px; margin: 0 auto; padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
          background: var(--tg-theme-bg-color, #fff); border-top: 1px solid rgba(128,128,128,.15); }
        .btn { flex: 1; font-size: 15px; font-weight: 700; padding: 13px; border-radius: 12px;
          border: none; background: #059669; color: #fff; }
        .btn:disabled { opacity: .45; }
        .btn.ghost { background: transparent; color: inherit; border: 1px solid rgba(128,128,128,.35); flex: 0 0 auto; padding: 13px 16px; }
        .err { color: #dc2626; font-size: 13px; margin: 10px 2px; }
        h2 { margin: 6px 0; }
      `}</style>
    </div>
  );
}
