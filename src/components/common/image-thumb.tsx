"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

/**
 * Rasm thumbnaili — bosilganda to'liq ekran lightbox (modal) ochiladi.
 * Yangi tab ochilmaydi; ESC yoki fon bosilsa yopiladi. fileId — Telegram file_id,
 * /api/rasm-preview/<fileId> orqali proxy qilinadi (BOT_TOKEN brauzerga chiqmaydi).
 */
export function ImageThumb({ fileId, caption, className }: { fileId: string; caption?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/rasm-preview/${encodeURIComponent(fileId)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Rasmni kattalashtirish"
        className={`inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted transition hover:ring-2 hover:ring-primary/40 ${className ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption ?? "rasm"} loading="lazy" className="h-full w-full object-cover" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Yopish"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={caption ?? "rasm"}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          {caption && (
            <div className="absolute bottom-4 left-1/2 max-w-[90vw] -translate-x-1/2 truncate rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white">
              {caption}
            </div>
          )}
        </div>
      )}
    </>
  );
}
