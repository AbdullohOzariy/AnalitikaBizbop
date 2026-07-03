"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Root layout'ning O'ZIDA xato bo'lganda ishga tushadi (error.tsx bunga yetmaydi).
 * Root layout'ni butunlay almashtiradi — shu sabab o'z <html>/<body>'siga ega bo'lishi
 * va global stillarni o'zi import qilishi shart (ThemeProvider'ga tayanmaydi).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="uz">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
          <h1 className="text-xl font-semibold">Tizimda xatolik yuz berdi</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Ilovani yuklashda kutilmagan xato bo&apos;ldi. Qayta urinib ko&apos;ring —
            muammo takrorlansa, administratorga xabar bering.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground/70">Kod: {error.digest}</p>
          ) : null}
          <button
            onClick={() => unstable_retry()}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:brightness-105 active:translate-y-px"
          >
            Qayta urinish
          </button>
        </div>
      </body>
    </html>
  );
}
