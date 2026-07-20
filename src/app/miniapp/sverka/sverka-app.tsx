"use client";

/**
 * Sverka Mini App — qadamma-qadam kiritish:
 * Sana → Firma (bazadan qidirib) → Sklad → Kontragent → Dagavor → Summa + rasm.
 * Rasm /api/rasm-yukla orqali Telegram'ga yuklanadi (file_id), yozuv /api/sverka/yozuv.
 */
import { useEffect, useRef, useState } from "react";
import { todayTashkentISO } from "@/lib/date";

type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string } };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  onEvent?: (event: string, cb: () => void) => void;
  /** Bot API 7.7+ — mavjudligi isVersionAtLeast bilan tekshirilsin. */
  isVersionAtLeast?: (v: string) => boolean;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  HapticFeedback?: {
    notificationOccurred: (t: "success" | "error" | "warning") => void;
    selectionChanged?: () => void;
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
  };
};
declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

type Firma = { id: number; name: string };
type Luglar = { sklad: string[]; qabulchilar: string[]; dagavor: string[] };

const STEPS = ["Sana", "Firma", "Sklad", "Qabul qildi", "Dagavor", "Summa va rasm"] as const;

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
  const [sana, setSana] = useState(todayTashkentISO);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [firmaQ, setFirmaQ] = useState("");
  const [firmaOpts, setFirmaOpts] = useState<Firma[]>([]);
  const [sklad, setSklad] = useState("");
  const [qabulQildi, setQabulQildi] = useState("");
  const [dagavor, setDagavor] = useState("");
  const [summa, setSumma] = useState("");
  const [rasm, setRasm] = useState<File | null>(null);
  const [luglar, setLuglar] = useState<Luglar>({ sklad: [], qabulchilar: [], dagavor: [] });
  const [sending, setSending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Telegram tayyorlash + ruxsat
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    // Ro'yxat tepasida over-scroll → sheet yopiladi → kiritilgan maydonlar yo'qoladi
    if (tg?.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes?.();
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
    qabulQildi.trim().length > 0,
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
          sklad: sklad.trim(), qabulQildi: qabulQildi.trim(), dagavor: dagavor.trim(),
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
    setStep(0); setFirma(null); setFirmaQ(""); setSklad(""); setQabulQildi("");
    setDagavor(""); setSumma(""); setRasm(null); setErr(""); setPhase("form");
    setSana(todayTashkentISO());
  };

  // ── Ekranlar ──
  if (phase === "loading") return <Shell><p className="muted center">Yuklanmoqda…</p></Shell>;
  if (phase === "denied") {
    return (
      <Shell>
        <div className="card center">
          <div className="lockic">🔒</div>
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
          <div className="successic">✓</div>
          <h2>Sverka saqlandi!</h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            {firma?.name} · {Number(summa).toLocaleString("uz-UZ")} so&apos;m
          </p>
          <button className="btn" onClick={resetForNew}>Yana kiritish</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell progress={((step + 1) / STEPS.length) * 100}>
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
            {luglar.qabulchilar.length === 0 ? (
              <p className="muted">
                Qabul qiluvchilar ro&apos;yxati bo&apos;sh — Sozlamalar → Sverka&apos;da ism qo&apos;shilsin.
              </p>
            ) : (
              <div className="opts">
                {luglar.qabulchilar.map((ism) => (
                  <button key={ism} className={`opt ${qabulQildi === ism ? "sel" : ""}`}
                    onClick={() => setQabulQildi(ism)}>
                    {qabulQildi === ism ? "✓ " : ""}{ism}
                  </button>
                ))}
              </div>
            )}
            {qabulQildi && <p className="picked">✓ {qabulQildi}</p>}
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
              <p className="muted">{sklad} · qabul: {qabulQildi} · {dagavor}</p>
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

function Shell({ children, progress }: { children: React.ReactNode; progress?: number }) {
  return (
    <div className="wrap">
      <header className="brandbar">
        <span className="branddot" />
        <b>Sverka</b>
        <small>BizBop</small>
      </header>
      {progress != null && (
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
      )}
      {children}
      {/* BizBop "Fresh" — spisaniya miniapp dizayn tili (emerald, Sora, tg-tema) */}
      <style>{`
        .wrap { max-width: 440px; margin: 0 auto; padding: 0 16px 96px;
          font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-theme-bg-color, #F2F3F7); color: var(--tg-theme-text-color, #0B0B0F);
          min-height: 100dvh;
          --brand: #1FBF5C; --brand4: #3DD17A; --brand6: #15A34A; --line: rgba(130,130,140,.16); }
        .brandbar { display: flex; align-items: center; gap: 9px; padding: 16px 2px 12px; }
        .brandbar b { font-family: Sora, -apple-system, sans-serif; font-size: 17px; letter-spacing: -.3px; }
        .brandbar small { margin-left: auto; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .6px; color: var(--tg-theme-hint-color, #8A8A8E); }
        .branddot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand);
          box-shadow: 0 0 0 4px rgba(31,191,92,.15); }
        .progress { height: 3px; border-radius: 99px; background: var(--line); overflow: hidden; margin-bottom: 12px; }
        .progress i { display: block; height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, var(--brand4), var(--brand6)); transition: width .25s ease; }
        .step-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
          margin: 0 2px 8px; color: var(--tg-theme-hint-color, #8A8A8E); }
        .card { background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line);
          border-radius: 18px; padding: 16px;
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10); }
        .center { text-align: center; padding: 30px 16px; }
        .muted { color: var(--tg-theme-hint-color, #8A8A8E); font-size: 13px; line-height: 1.45; }
        .lockic { width: 64px; height: 64px; margin: 0 auto 12px; display: flex; align-items: center;
          justify-content: center; font-size: 28px; border-radius: 20px; background: rgba(130,130,140,.10); }
        .successic { width: 76px; height: 76px; margin: 0 auto 14px; display: flex; align-items: center;
          justify-content: center; font-size: 38px; font-weight: 800; color: #fff; border-radius: 50%;
          background: linear-gradient(180deg, var(--brand4), var(--brand6));
          box-shadow: 0 14px 40px -8px rgba(31,191,92,.45); }
        .inp { width: 100%; box-sizing: border-box; font-size: 16px; padding: 13px 14px;
          border-radius: 14px; border: 1px solid var(--line);
          background: var(--tg-theme-bg-color, #F2F3F7); color: inherit; outline: none;
          transition: border-color .15s, box-shadow .15s; }
        .inp:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(31,191,92,.15); }
        .opts { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; max-height: 300px; overflow-y: auto; }
        .opt { text-align: left; font-size: 14.5px; font-weight: 500; padding: 12px 14px; border-radius: 14px;
          border: 1px solid var(--line); background: var(--tg-theme-bg-color, #F2F3F7); color: inherit;
          transition: transform .1s; }
        .opt:active { transform: scale(.98); }
        .opt.sel { border-color: var(--brand); background: rgba(31,191,92,.10); color: var(--brand6); font-weight: 700; }
        .picked { margin: 12px 2px 0; font-weight: 700; color: var(--brand6); display: inline-flex;
          align-items: center; gap: 6px; background: rgba(31,191,92,.10); border: 1px solid rgba(31,191,92,.25);
          border-radius: 12px; padding: 8px 14px; font-size: 14px; }
        .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 7px; }
        .chip { font-size: 12.5px; font-weight: 600; padding: 8px 13px; border-radius: 999px;
          border: 1px solid var(--line); background: var(--tg-theme-bg-color, #F2F3F7); color: inherit;
          transition: transform .1s; }
        .chip:active { transform: scale(.96); }
        .chip.on { background: linear-gradient(180deg, var(--brand4), var(--brand6)); color: #fff;
          border-color: transparent; box-shadow: 0 8px 24px -6px rgba(31,191,92,.40); }
        .file { display: block; margin-top: 10px; text-align: center; font-size: 14px; font-weight: 600;
          padding: 14px; border-radius: 14px; border: 1.5px dashed rgba(31,191,92,.45);
          background: rgba(31,191,92,.06); color: var(--brand6); cursor: pointer; }
        .summary { margin-top: 14px; font-size: 13px; line-height: 1.55; border-top: 1px solid var(--line);
          padding-top: 10px; }
        .summary p { margin: 2px 0; }
        .nav { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px;
          max-width: 440px; margin: 0 auto; padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
          background: var(--tg-theme-bg-color, #F2F3F7); border-top: 1px solid var(--line); }
        .btn { flex: 1; font-size: 15.5px; font-weight: 700; letter-spacing: -.2px; padding: 15px;
          border-radius: 16px; border: none; color: #fff;
          background: linear-gradient(180deg, var(--brand4), var(--brand6));
          box-shadow: 0 8px 24px -6px rgba(31,191,92,.40); transition: transform .12s, box-shadow .12s; }
        .btn:active { transform: scale(.97); }
        .btn:disabled { opacity: .4; box-shadow: none; }
        .btn.ghost { flex: 0 0 auto; padding: 15px 18px; color: inherit; box-shadow: none;
          background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line); }
        .err { color: #DC2626; font-size: 13px; font-weight: 500; margin: 10px 2px;
          background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.25);
          border-radius: 12px; padding: 10px 13px; }
        h2 { margin: 6px 0; font-family: Sora, -apple-system, sans-serif; font-size: 20px; letter-spacing: -.4px; }
      `}</style>
    </div>
  );
}
