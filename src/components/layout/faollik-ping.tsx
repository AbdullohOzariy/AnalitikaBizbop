"use client";

import { useEffect, useRef } from "react";

/**
 * Platformadagi faollik signali (Tizim → Kirishlar).
 *
 * NEGA KERAK: `(app)/layout.tsx` faqat TO'LIQ sahifa yuklanishida render bo'ladi —
 * App Router'da SPA navigatsiyasida umumiy layout qayta render QILINMAYDI.
 * Signalsiz sessiya davomiyligi doim ~0 chiqardi.
 *
 * NEGA "HEARTBEAT" EMAS: ochiq qoldirilgan yorliq tunab qolsa, oddiy taymer uni
 * "8 soat faol ishladi" deb ko'rsatardi. Shu sababli signal FAQAT haqiqiy
 * harakatdan (bosish/klaviatura) va yorliq ko'rinadigan bo'lganda yuboriladi,
 * 2 daqiqada eng ko'pi bir marta.
 *
 * Holat (state) ATAYLAB yo'q — komponent hech narsa render qilmaydi, shuning
 * uchun qayta render ham, effekt ichida set-state ham yo'q (repo lint qoidasi).
 */
const PING_MS = 2 * 60_000;

export function FaollikPing() {
  const oxirgi = useRef(0);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - oxirgi.current < PING_MS) return;
      oxirgi.current = now;
      // keepalive: sahifa yopilayotganda ham yuborilsin. Xato — jim yutiladi.
      void fetch("/api/tizim/faollik", {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    };

    ping(); // sahifa ochilgan payt
    const opts = { passive: true } as const;
    // `wheel` va `touchstart` ham SANALADI: uzoq hisobotni g'ildirak bilan
    // o'qib o'tirgan odam hech narsa bosmasligi mumkin — usiz uning sessiyasi
    // vaqtidan oldin yopilardi. Ping baribir 2 daqiqada bir marta chegaralangan.
    const hodisalar = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const h of hodisalar) window.addEventListener(h, ping, opts);
    document.addEventListener("visibilitychange", ping);
    return () => {
      for (const h of hodisalar) window.removeEventListener(h, ping);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
