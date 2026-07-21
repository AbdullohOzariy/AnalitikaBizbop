"use client";

/**
 * Sverka Mini App — qadamma-qadam kiritish:
 * Sana → Firma (bazadan qidirib) → Sklad → Kontragent → Dagavor → Summa + rasm.
 * Rasm /api/rasm-yukla orqali Telegram'ga yuklanadi (file_id), yozuv /api/sverka/yozuv.
 */
import { useEffect, useRef, useState } from "react";
import { todayTashkentISO } from "@/lib/date";
import { formatUZS } from "@/lib/format";

type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string } };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  onEvent?: (event: string, cb: () => void) => void;
  /** Cleanup uchun — obunani olib tashlamasa themeChanged'lar to'planadi. */
  offEvent?: (event: string, cb: () => void) => void;
  /** Bot API 7.7+ — mavjudligi isVersionAtLeast bilan tekshirilsin. */
  isVersionAtLeast?: (v: string) => boolean;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  /**
   * Native "orqaga" tugmasi. Sukut bo'yicha YASHIRIN — ko'rsatilmasa Android
   * hardware back / iOS swipe-down qadamdan qaytarish o'rniga ilovani yopadi
   * va to'ldirilgan forma tasdiqsiz yo'qoladi.
   */
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
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

/**
 * Xato TURI — "ruxsat yo'q" ni tarmoq/server uzilishidan ajratadi.
 * Ilgari `res.json()` `res.ok` dan OLDIN chaqilardi va butun ruxsat oqimi
 * `catch { setPhase("denied") }` bilan yakunlanardi: Railway redeploy (502
 * HTML), Neon uzilishi yoki 429 rate-limit — hammasi 🔒 "Ruxsat yo'q" ekraniga
 * olib kelardi. U terminal ekran, qayta urinish yo'q.
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
const xatoTuri = (e: unknown): XatoTuri => (e instanceof ApiXato ? e.turi : "server");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), "x-telegram-init-data": initData },
    });
  } catch {
    throw new ApiXato("Internetga ulanib bo'lmadi.", "tarmoq");
  }
  // JSON'ni ixtiyoriy o'qiymiz: statusni aniqlash undan MUSTAQIL bo'lsin
  let j: (T & { xato?: string }) | null = null;
  try { j = (await res.json()) as T & { xato?: string }; } catch { /* HTML/bo'sh javob */ }
  if (!res.ok) {
    // 429 ataylab "server": u vaqtinchalik, ruxsat muammosi emas
    const turi: XatoTuri = res.status === 401 || res.status === 403 ? "ruxsat" : "server";
    throw new ApiXato(j?.xato ?? (turi === "ruxsat" ? "Ruxsat yo'q." : "Server javob bermadi."), turi);
  }
  if (j === null) throw new ApiXato("Server javobi tushunarsiz.", "server");
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
  /* "denied" (terminal) va "error" (qayta urinsa bo'ladi) ALOHIDA — pastdagi
     ApiXato izohiga qarang. */
  const [phase, setPhase] = useState<"loading" | "denied" | "error" | "form" | "done">("loading");
  const [xatoMsg, setXatoMsg] = useState("");
  const [urinish, setUrinish] = useState(0);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [ism, setIsm] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

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
    // Tema Telegram'dan (prefers-color-scheme emas — custom temalar mos kelmaydi)
    const onTheme = () => setTheme(window.Telegram?.WebApp?.colorScheme ?? "light");
    tg?.onEvent?.("themeChanged", onTheme);
    (async () => {
      setTheme(tg?.colorScheme ?? "light");
      setPhase("loading");
      try {
        const r = await api<{ allowed: boolean; user: { id: number; ism: string | null } | null }>(
          "/api/sverka/ruxsat", { method: "POST" }
        );
        setIsm(r.user?.ism ?? null);
        if (r.allowed) { setPhase("form"); return; }
        // Sverka ruxsati yo'q — spisaniya roli bo'lsa o'sha appga o'tamiz
        try {
          const s = await api<{ allowed: boolean }>("/api/ruxsat", { method: "POST" });
          if (s.allowed) { window.location.replace("/miniapp/index.html?via=kirish" + window.location.hash); return; }
        } catch { /* jim — bu shunchaki ixtiyoriy yo'naltirish */ }
        // JSON keldi va allowed=false → HAQIQIY rad etish
        setPhase("denied");
      } catch (e) {
        setXatoMsg(e instanceof Error ? e.message : "Xatolik yuz berdi");
        setPhase(xatoTuri(e) === "ruxsat" ? "denied" : "error");
      }
    })();
    return () => { window.Telegram?.WebApp?.offEvent?.("themeChanged", onTheme); };
  }, [urinish]);

  /* Native BackButton — sehrgar qadamlari uchun. Ichki "← Orqaga" tugmasi
     ATAYLAB qoladi: Telegram Desktop'da BackButton kam ko'zga tashlanadi, va
     uni olib tashlash gorizontal joy beradi, vertikal emas. */
  useEffect(() => {
    const bb = window.Telegram?.WebApp?.BackButton;
    if (!bb) return;
    const orqaga = () => setStep((s) => Math.max(0, s - 1));
    if (phase === "form" && step > 0) { bb.onClick(orqaga); bb.show(); }
    else bb.hide();
    return () => { bb.offClick(orqaga); };
  }, [phase, step]);

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

  /** Jonli aks-sado uchun — `summa` xom string bo'lib qoladi (Number() submit'da). */
  const summaSon = Number(summa);

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
  if (phase === "loading") {
    return <Shell theme={theme}><div className="skwrap"><div className="sk t" /><div className="sk c" /><div className="sk b" /></div></Shell>;
  }
  /* Tarmoq/server uzilishi — vaqtinchalik, adminni bezovta qilish shart emas */
  if (phase === "error") {
    return (
      <Shell theme={theme}>
        <div className="card center">
          <div className="lockic">📡</div>
          <h2>Ulanib bo&apos;lmadi</h2>
          <p className="muted" style={{ marginBottom: 18 }}>{xatoMsg || "Aloqa yoki server vaqtincha mavjud emas."}</p>
          <button className="btn" onClick={() => setUrinish((n) => n + 1)}>↻ Qayta urinish</button>
        </div>
      </Shell>
    );
  }
  if (phase === "denied") {
    return (
      <Shell theme={theme}>
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
      <Shell theme={theme} ism={ism}>
        <div className="card center">
          <div className="successic">✓</div>
          <h2>Sverka saqlandi!</h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            {firma?.name} · {formatUZS(Number(summa))} so&apos;m
          </p>
          <button className="btn" onClick={resetForNew}>Yana kiritish</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell theme={theme} ism={ism} progress={((step + 1) / STEPS.length) * 100}>
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
            {/* type="number" ATAYLAB saqlanadi — Number(summa) submit'da va
                canNext'da ishlatiladi, maskalangan string NaN berardi. Guruhlash
                o'rniga input OSTIDA jonli aks-sado: bitta ortiqcha nol
                (10x xato) validatsiyadan ham, zod'dan ham o'tib ketadi va
                miniapp orqali tuzatib bo'lmaydi (DELETE/PATCH yo'q). */}
            <input type="number" inputMode="decimal" value={summa} onChange={(e) => setSumma(e.target.value)}
              placeholder="Summa (so'm)" className="inp" autoFocus />
            {summaSon > 0 && <p className="echo">{formatUZS(summaSon)} so&apos;m</p>}
            <label className="file">
              {rasm ? `📎 ${rasm.name || "rasm tanlandi"} ✓` : "📷 Nakladnoy rasmini biriktirish"}
              <input type="file" accept="image/*" hidden
                onChange={(e) => setRasm(e.target.files?.[0] ?? null)} />
            </label>
            {/* Tekshiruv xulosasi — SUMMA bilan: eng muhim maydon shu yerda
                yo'q edi, ya'ni yagona tekshirish nuqtasi uni ko'rsatmasdi. */}
            <div className="summary">
              <p>{sana} · <b>{firma?.name}</b></p>
              <p className="muted">{sklad} · qabul: {qabulQildi} · {dagavor}</p>
              <p className="sum">Summa: <b>{summaSon > 0 ? `${formatUZS(summaSon)} so'm` : "—"}</b></p>
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
          {/* aria-pressed — chip tanlangani ekran o'quvchida ham bilinsin
              (.opt ga kerak emas: u tanlanganda matnga "✓ " qo'shadi) */}
          {chips.map((c) => (
            <button key={c} className={`chip ${value === c ? "on" : ""}`} aria-pressed={value === c}
              onClick={() => onChange(c)}>{c}</button>
          ))}
        </div>
      )}
    </>
  );
}

function Shell({ children, progress, theme = "light", ism }: {
  children: React.ReactNode; progress?: number; theme?: "light" | "dark"; ism?: string | null;
}) {
  return (
    <div className="wrap" data-theme={theme}>
      <header className="brandbar">
        <span className="branddot" />
        <b>Sverka</b>
        {/* Ism — sof dizayn izchilligi (sotuv miniappida bor). Bu atributsiya
            EMAS: yozuv egasi serverda verifyInitData bilan aniqlanadi. */}
        {ism ? <span className="who">{ism}</span> : <small>BizBop</small>}
      </header>
      {progress != null && (
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
      )}
      {children}
      {/* BizBop "Fresh" — spisaniya miniapp dizayn tili (emerald, Sora, tg-tema).
          Brend/kenglik sotuv miniappi bilan birlashtirildi: #10B981 va 460px
          (ilgari #1FBF5C / 440px — bir mahsulot ichida ikki xil yashil edi). */}
      <style>{`
        .wrap { max-width: 460px; margin: 0 auto; padding: 0 16px 96px;
          font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-bg); color: var(--tg-text);
          min-height: 100dvh;

          --tg-bg:   var(--tg-theme-bg-color, #F4F7F5);
          --tg-text: var(--tg-theme-text-color, #0B1A14);
          --tg-hint: var(--tg-theme-hint-color, #8A9C93);
          --tg-card: var(--tg-theme-secondary-bg-color, #FFFFFF);
          --brand: #10B981; --brand4: #12B67F; --brand6: #059669;
          /* Aksent MATNI uchun alohida token: --brand6 ni to'g'ridan-to'g'ri
             yoritib bo'lmaydi (u .btn/.chip.on/.successic gradientlarida ham
             turadi — u yerda oq matn kontrasti buzilardi). Oq karta ustida
             --brand6 (#059669) ≈3.8:1 — 15px/800 matn AA "large" emas.
             #047857 (5.5:1 OQ ustida) ham yetarli emas edi: .opt.sel va .picked
             oq emas, --brand-soft TONLANGAN fon ustida turadi va u yerda 4.32:1
             ga tushardi. #065F46 tonlangan fonda ham 4.5:1 dan yuqori. */
          --accent-text: #065F46;
          --brand-soft: color-mix(in srgb, var(--brand) 12%, transparent);
          --danger: #DC2626;
          --line: color-mix(in srgb, var(--tg-hint) 22%, transparent);
          --line-2: color-mix(in srgb, var(--tg-hint) 12%, transparent); }

        .wrap[data-theme="dark"] {
          --line: color-mix(in srgb, var(--tg-hint) 32%, transparent);
          --line-2: color-mix(in srgb, var(--tg-hint) 18%, transparent);
          --brand-soft: color-mix(in srgb, var(--brand) 20%, transparent);
          /* Qorong'i fonda #059669 va #DC2626 AA dan past — ochroq variant */
          --accent-text: #34D399; --danger: #F87171; }

        .brandbar { display: flex; align-items: center; gap: 9px; padding: 16px 2px 12px; }
        /* var(--font-sora) — next/font o'zgaruvchisi (html'da). Bare "Sora"
           yozilsa oila topilmay jimgina -apple-system ga tushib qolardi. */
        .brandbar b { font-family: var(--font-sora), -apple-system, sans-serif; font-size: 17px; letter-spacing: -.3px; }
        .brandbar small { margin-left: auto; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .6px; color: var(--tg-hint); }
        .who { margin-left: auto; font-size: 11.5px; font-weight: 600; color: var(--tg-hint);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
        .branddot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand);
          box-shadow: 0 0 0 4px var(--brand-soft); }
        .progress { height: 3px; border-radius: 99px; background: var(--line); overflow: hidden; margin-bottom: 12px; }
        .progress i { display: block; height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, var(--brand4), var(--brand6)); transition: width .25s ease; }
        .step-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
          margin: 0 2px 8px; color: var(--tg-hint); }
        .card { background: var(--tg-card); border: 1px solid var(--line);
          border-radius: 18px; padding: 16px;
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10); }
        .wrap[data-theme="dark"] .card {
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 14px 32px -18px rgba(0,0,0,.65); }
        .center { text-align: center; padding: 30px 16px; }
        .muted { color: var(--tg-hint); font-size: 13px; line-height: 1.45; }
        .lockic { width: 64px; height: 64px; margin: 0 auto 12px; display: flex; align-items: center;
          justify-content: center; font-size: 28px; border-radius: 20px;
          background: color-mix(in srgb, var(--tg-hint) 12%, transparent); }
        .successic { width: 76px; height: 76px; margin: 0 auto 14px; display: flex; align-items: center;
          justify-content: center; font-size: 38px; font-weight: 800; color: #fff; border-radius: 50%;
          background: linear-gradient(180deg, var(--brand4), var(--brand6));
          box-shadow: 0 14px 40px -8px rgba(16,185,129,.45); }
        .inp { width: 100%; box-sizing: border-box; font-size: 16px; padding: 13px 14px;
          border-radius: 14px; border: 1px solid var(--line);
          background: var(--tg-bg); color: inherit; outline: none;
          transition: border-color .15s, box-shadow .15s; }
        .inp:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
        /* Summa aks-sadosi — type="number" da guruhlash bo'lmagani uchun */
        .echo { margin: 8px 2px 0; font-size: 15px; font-weight: 800; letter-spacing: -.2px;
          color: var(--accent-text); font-variant-numeric: tabular-nums; }
        /* max-height OLIB TASHLANDI: ichki scroll konteyner sahifa scroll'i
           bilan raqobatlashardi. Qabulchilar ro'yxati serverda cheklanmagan
           (ataylab) — uzun ro'yxat sahifani uzaytiradi, .nav esa fixed, ya'ni
           ro'yxat qancha uzun bo'lsa ham tugmalar yetib boradi. */
        .opts { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; }
        .opt { text-align: left; font-size: 14.5px; font-weight: 500; padding: 12px 14px; border-radius: 14px;
          border: 1px solid var(--line); background: var(--tg-bg); color: inherit;
          transition: transform .1s; }
        .opt:active { transform: scale(.98); }
        .opt.sel { border-color: var(--brand); background: var(--brand-soft); color: var(--accent-text); font-weight: 700; }
        .picked { margin: 12px 2px 0; font-weight: 700; color: var(--accent-text); display: inline-flex;
          align-items: center; gap: 6px; background: var(--brand-soft);
          border: 1px solid color-mix(in srgb, var(--brand) 25%, transparent);
          border-radius: 12px; padding: 8px 14px; font-size: 14px; }
        .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 7px; }
        .chip { font-size: 12.5px; font-weight: 600; padding: 8px 13px; border-radius: 999px;
          border: 1px solid var(--line); background: var(--tg-bg); color: inherit;
          transition: transform .1s; }
        .chip:active { transform: scale(.96); }
        .chip.on { background: linear-gradient(180deg, var(--brand4), var(--brand6)); color: #fff;
          border-color: transparent; box-shadow: 0 8px 24px -6px rgba(16,185,129,.40); }
        .file { display: block; margin-top: 10px; text-align: center; font-size: 14px; font-weight: 600;
          padding: 14px; border-radius: 14px;
          border: 1.5px dashed color-mix(in srgb, var(--brand) 45%, transparent);
          background: color-mix(in srgb, var(--brand) 6%, transparent); color: var(--accent-text); cursor: pointer; }
        .summary { margin-top: 14px; font-size: 13px; line-height: 1.55; border-top: 1px solid var(--line);
          padding-top: 10px; }
        .summary p { margin: 2px 0; }
        .summary .sum { margin-top: 6px; font-size: 14px; font-variant-numeric: tabular-nums; }
        .nav { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px;
          max-width: 460px; margin: 0 auto;
          padding: 10px 16px calc(12px + max(env(safe-area-inset-bottom, 0px), var(--tg-safe-area-inset-bottom, 0px)));
          background: var(--tg-bg); border-top: 1px solid var(--line); }
        .btn { flex: 1; font-size: 15.5px; font-weight: 700; letter-spacing: -.2px; padding: 15px;
          border-radius: 16px; border: none; color: #fff;
          background: linear-gradient(180deg, var(--brand4), var(--brand6));
          box-shadow: 0 8px 24px -6px rgba(16,185,129,.40); transition: transform .12s, box-shadow .12s; }
        .btn:active { transform: scale(.97); }
        .btn:disabled { opacity: .4; box-shadow: none; }
        .btn.ghost { flex: 0 0 auto; padding: 15px 18px; color: inherit; box-shadow: none;
          background: var(--tg-card); border: 1px solid var(--line); }
        .err { color: var(--danger); font-size: 13px; font-weight: 500; margin: 10px 2px;
          background: color-mix(in srgb, var(--danger) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
          border-radius: 12px; padding: 10px 13px; }
        h2 { margin: 6px 0; font-family: var(--font-sora), -apple-system, sans-serif; font-size: 20px; letter-spacing: -.4px; }

        /* Skeleton — sotuv miniappidan port. --line-2 SHART: usiz gradient
           computed-value bosqichida yaroqsiz bo'lib skeleton ko'rinmay qoladi. */
        .skwrap { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; }
        .sk { border-radius: 16px; background: linear-gradient(100deg, var(--line-2) 30%, var(--line) 50%, var(--line-2) 70%);
          background-size: 200% 100%; animation: shimmer 1.3s infinite; }
        .sk.t { height: 14px; width: 40%; border-radius: 8px; }
        .sk.c { height: 120px; } .sk.b { height: 54px; }
        @keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

        @media (prefers-reduced-motion: reduce) {
          .sk { animation: none; }
          .btn, .chip, .opt, .progress i, .inp { transition: none; }
        }
      `}</style>
    </div>
  );
}
