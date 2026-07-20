"use client";

/**
 * Rol bo'yicha avto-yo'naltirish — BizBop "Fresh" dizayn tili (spisaniya
 * miniapp bilan bir xil): emerald brend, Sora sarlavhalar, tg-tema moslashuvi.
 * initData sessionStorage + hash orqali keyingi sahifada ham tiklanadi.
 */
import { useEffect, useState } from "react";

// Window.Telegram tipi sverka-app.tsx dagi global e'londan keladi.
type Holat =
  | { t: "loading" }
  | { t: "denied"; id: number | null }
  | { t: "choose"; spis: boolean; sverka: boolean; driver: boolean };

const SPISANIYA_URL = "/miniapp/index.html?via=kirish";
const SVERKA_URL = "/miniapp/sverka";
const LOGISTIKA_URL = "/miniapp/logistika";

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
        const j = (await res.json()) as {
          allowed: boolean; sverka: boolean; driver: boolean; user: { id: number } | null;
        };
        const spis = !!j.allowed;
        const sverka = !!j.sverka;
        const driver = !!j.driver;
        // Haydovchi TEKSHIRUVI birinchi: u kun bo'yi shu ilovada ishlaydi, boshqa
        // ro'yxatda ham turgan bo'lsa ham to'g'ridan reys ekraniga tushishi kerak.
        // Bir nechta rol bo'lsagina tanlov ekrani ko'rsatiladi.
        const rollar = [spis, sverka, driver].filter(Boolean).length;
        if (rollar > 1) setSt({ t: "choose", spis, sverka, driver });
        else if (driver) go(LOGISTIKA_URL);
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
      {/* Brend sarlavha */}
      <header className="brandbar">
        <span className="branddot" />
        <b>BizBop</b>
        <small>mini app</small>
      </header>

      {st.t === "loading" && (
        <div className="center">
          <div className="spin" />
          <p className="muted">Yuklanmoqda…</p>
        </div>
      )}

      {st.t === "denied" && (
        <div className="card center" style={{ marginTop: 24 }}>
          <div className="lockic">🔒</div>
          <h2>Ruxsat yo&apos;q</h2>
          {st.id != null && <p className="idbox">🆔 {st.id}</p>}
          <p className="muted">
            Shu ID raqamni adminga yuboring — ruxsat berilgach, botni qayta oching.
          </p>
        </div>
      )}

      {st.t === "choose" && (
        <div className="choose">
          <h2>Bo&apos;limni tanlang</h2>
          <p className="muted" style={{ marginBottom: 16 }}>Sizda bir nechta bo&apos;limga ruxsat bor</p>

          {st.driver && (
            <button className="tile" onClick={() => go(LOGISTIKA_URL)}>
              <span className="chip" style={{ background: "rgba(59,130,246,.14)" }}>🚚</span>
              <span className="tl">
                <b>Reys</b>
                <small>Yo&apos;lga chiqish va yetib borishni belgilash</small>
              </span>
              <span className="arr">›</span>
            </button>
          )}

          {st.spis && (
            <button className="tile" onClick={() => go(SPISANIYA_URL)}>
              <span className="chip" style={{ background: "rgba(239,68,68,.12)" }}>📝</span>
              <span className="tl">
                <b>Spisaniya</b>
                <small>Hisobdan chiqarish yozuvi</small>
              </span>
              <span className="arr">›</span>
            </button>
          )}

          {st.sverka && (
            <button className="tile" onClick={() => go(SVERKA_URL)}>
              <span className="chip" style={{ background: "rgba(31,191,92,.14)" }}>📑</span>
              <span className="tl">
                <b>Sverka</b>
                <small>Nakladnoy bilan solishtirish</small>
              </span>
              <span className="arr">›</span>
            </button>
          )}
        </div>
      )}

      <style>{`
        .wrap { min-height: 100dvh; max-width: 440px; margin: 0 auto; padding: 0 16px 24px;
          font-family: -apple-system, system-ui, sans-serif;
          background: var(--tg-theme-bg-color, #F2F3F7); color: var(--tg-theme-text-color, #0B0B0F);
          --brand: #1FBF5C; --line: rgba(130,130,140,.16); }
        .brandbar { display: flex; align-items: center; gap: 9px; padding: 16px 2px 18px; }
        .brandbar b { font-family: Sora, -apple-system, sans-serif; font-size: 17px; letter-spacing: -.3px; }
        .brandbar small { margin-left: auto; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .6px; color: var(--tg-theme-hint-color, #8A8A8E); }
        .branddot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand);
          box-shadow: 0 0 0 4px rgba(31,191,92,.15); }
        .center { text-align: center; padding: 48px 16px; }
        .muted { color: var(--tg-theme-hint-color, #8A8A8E); font-size: 13.5px; line-height: 1.45; }
        .card { background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line);
          border-radius: 20px; padding: 26px 18px;
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10); }
        .lockic { width: 64px; height: 64px; margin: 0 auto 12px; display: flex; align-items: center;
          justify-content: center; font-size: 28px; border-radius: 20px; background: rgba(130,130,140,.10); }
        h2 { margin: 4px 0 6px; font-family: Sora, -apple-system, sans-serif; font-size: 20px; letter-spacing: -.4px; }
        .idbox { font-family: ui-monospace, monospace; font-size: 17px; font-weight: 700;
          background: rgba(31,191,92,.10); color: var(--brand); border: 1px solid rgba(31,191,92,.25);
          border-radius: 12px; padding: 9px 16px; display: inline-block; margin: 6px 0 10px; user-select: all; }
        .spin { width: 28px; height: 28px; margin: 0 auto 12px; border-radius: 50%;
          border: 3px solid var(--line); border-top-color: var(--brand); animation: sp .8s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        .choose { padding-top: 8px; }
        .choose h2 { font-size: 22px; }
        .tile { display: flex; align-items: center; gap: 13px; width: 100%; text-align: left;
          background: var(--tg-theme-secondary-bg-color, #fff); border: 1px solid var(--line);
          border-radius: 22px; padding: 15px 14px; margin-bottom: 10px; cursor: pointer; color: inherit;
          box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10);
          transition: transform .12s, box-shadow .12s; }
        .tile:active { transform: scale(.97); box-shadow: none; }
        .chip { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
          border-radius: 16px; font-size: 22px; flex-shrink: 0; }
        .tl { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .tl b { font-family: Sora, -apple-system, sans-serif; font-size: 15.5px; letter-spacing: -.2px; }
        .tl small { color: var(--tg-theme-hint-color, #8A8A8E); font-size: 12px; }
        .arr { color: var(--tg-theme-hint-color, #8A8A8E); font-size: 22px; font-weight: 300; padding-right: 2px; }
      `}</style>
    </div>
  );
}
