"use client";

/**
 * Rol bo'yicha avto-yo'naltirish. initData sessionStorage orqali keyingi
 * sahifada ham tiklanadi (telegram-web-app.js standart xatti-harakati),
 * qo'shimcha ishonch uchun hash ham uzatiladi.
 */
import { useEffect, useState } from "react";

// Window.Telegram tipi sverka-app.tsx dagi global e'londan keladi.
type Holat =
  | { t: "loading" }
  | { t: "denied"; id: number | null }
  | { t: "choose" };

const SPISANIYA_URL = "/miniapp/index.html?via=kirish";
const SVERKA_URL = "/miniapp/sverka";

function go(url: string) {
  window.location.replace(url + window.location.hash);
}

export function KirishApp() {
  const [st, setSt] = useState<Holat>({ t: "loading" });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready(); tg?.expand();
    (async () => {
      try {
        const res = await fetch("/api/ruxsat", {
          method: "POST",
          headers: { "x-telegram-init-data": tg?.initData ?? "" },
        });
        const j = (await res.json()) as { allowed: boolean; sverka: boolean; user: { id: number } | null };
        const spis = !!j.allowed;
        const sverka = !!j.sverka;
        if (spis && sverka) setSt({ t: "choose" });
        else if (spis) go(SPISANIYA_URL);
        else if (sverka) go(SVERKA_URL);
        else setSt({ t: "denied", id: j.user?.id ?? null });
      } catch {
        setSt({ t: "denied", id: null });
      }
    })();
  }, []);

  return (
    <div className="wrap">
      {st.t === "loading" && (
        <div className="center">
          <div className="spin" />
          <p className="muted">Yuklanmoqda…</p>
        </div>
      )}

      {st.t === "denied" && (
        <div className="center">
          <p style={{ fontSize: 44 }}>🔒</p>
          <h2>Ruxsat yo&apos;q</h2>
          {st.id != null && (
            <p className="idbox">🆔 {st.id}</p>
          )}
          <p className="muted">
            Shu ID raqamni adminga yuboring — ruxsat berilgach, botni qayta oching.
          </p>
        </div>
      )}

      {st.t === "choose" && (
        <div className="choose">
          <h2>Bo&apos;limni tanlang</h2>
          <p className="muted" style={{ marginBottom: 18 }}>Sizda ikkala bo&apos;limga ham ruxsat bor</p>
          <button className="tile" onClick={() => go(SPISANIYA_URL)}>
            <span className="emoji">📝</span>
            <span className="tl">
              <b>Spisaniya</b>
              <small>Hisobdan chiqarish yozuvi</small>
            </span>
            <span className="arr">→</span>
          </button>
          <button className="tile" onClick={() => go(SVERKA_URL)}>
            <span className="emoji">📑</span>
            <span className="tl">
              <b>Sverka</b>
              <small>Nakladnoy bilan solishtirish</small>
            </span>
            <span className="arr">→</span>
          </button>
        </div>
      )}

      <style>{`
        .wrap { min-height: 100dvh; display: flex; align-items: center; justify-content: center;
          padding: 20px; font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111); }
        .center { text-align: center; max-width: 320px; }
        .muted { color: var(--tg-theme-hint-color, #6b7280); font-size: 14px; }
        .idbox { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 700;
          background: var(--tg-theme-secondary-bg-color, #f3f4f6); border-radius: 12px;
          padding: 10px 16px; display: inline-block; margin: 8px 0; user-select: all; }
        .spin { width: 28px; height: 28px; margin: 0 auto 12px; border-radius: 50%;
          border: 3px solid rgba(128,128,128,.25); border-top-color: #059669;
          animation: sp 0.8s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        .choose { width: 100%; max-width: 380px; text-align: center; }
        .choose h2 { margin: 0 0 4px; }
        .tile { display: flex; align-items: center; gap: 14px; width: 100%;
          background: var(--tg-theme-secondary-bg-color, #f3f4f6);
          border: 1px solid rgba(128,128,128,.18); border-radius: 16px;
          padding: 16px; margin-bottom: 10px; cursor: pointer; color: inherit;
          text-align: left; transition: transform .08s; }
        .tile:active { transform: scale(.98); }
        .emoji { font-size: 28px; }
        .tl { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .tl b { font-size: 16px; }
        .tl small { color: var(--tg-theme-hint-color, #6b7280); font-size: 12px; }
        .arr { color: #059669; font-size: 20px; font-weight: 700; }
        h2 { margin: 6px 0; }
      `}</style>
    </div>
  );
}
