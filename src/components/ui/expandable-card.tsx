"use client";

import { useState, useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/use-mounted";

export function ExpandableCard({
  title,
  children,
  className,
  headerClassName,
  contentClassName,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useMounted();
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Fokus boshqaruvi: ochilganda yopish tugmasiga, yopilganda ochgan elementga qaytadi.
  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      closeBtnRef.current?.focus();
    } else {
      lastFocusedRef.current?.focus?.();
    }
  }, [open]);

  // Ochiq bo'lganda body scroll'ini bloklash
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Card className={className}>
        <CardHeader
          className={cn(
            "flex flex-row items-center justify-between gap-2",
            headerClassName
          )}
        >
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground -mr-1"
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className={contentClassName}>{children}</CardContent>
      </Card>

      {mounted &&
        createPortal(
          <div
            aria-hidden={!open}
            className={cn(
              "fixed inset-0 z-[100] transition-all duration-200",
              open ? "pointer-events-auto" : "pointer-events-none"
            )}
          >
            {/* Backdrop */}
            <div
              className={cn(
                "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
                open ? "opacity-100" : "opacity-0"
              )}
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <div
              role="dialog"
              aria-modal={open || undefined}
              aria-labelledby={titleId}
              className={cn(
                "absolute inset-4 flex flex-col rounded-2xl bg-popover ring-1 ring-foreground/10 shadow-2xl overflow-hidden transition-all duration-200",
                open
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4 shrink-0">
                <span id={titleId} className="text-lg font-semibold">{title}</span>
                <Button
                  ref={closeBtnRef}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setOpen(false)}
                  aria-label="Yopish"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content — kengaytirilganda grafiklar modalni to'liq egallaydi.
                  Uch xil holatni qamraydi:
                  1) To'g'ridan-to'g'ri bola ResponsiveContainer (v2: CountDynamics)
                     → flex-1 bilan to'liq cho'ziladi.
                  2) O'ralgan/ko'p grafik (v2: MarjaBase `<div className="pt-2">`,
                     GroupSales grid) → naslli (descendant) ResponsiveContainer'larga
                     katta beton min-balandlik (`!min-h-[60vh]`) berilib, inline
                     `height={280|300}` yengiladi; ResizeObserver yangidan o'lchaydi.
                  3) Qattiq balandlikli o'rab turuvchi div (v1: DailySalesChart va h.k.
                     `<div className="h-72">`) → to'g'ridan-to'g'ri div bolaga flex-1 +
                     h-auto berilib, qotgan balandlik (h-72/h-64) ochiq holatda bekor
                     qilinadi, ichidagi `height="100%"` container to'liq cho'ziladi.
                  Grafiksiz widgetlar (ro'yxat/kartalar/jadval) recharts-container
                  saqlamaydi, demak min-h qoidalari ularga ta'sir qilmaydi; flex-1
                  esa faqat ko'proq joy beradi, mazmunni buzmaydi. */}
              <div
                className={cn(
                  "flex flex-1 flex-col overflow-auto p-6 min-h-0",
                  // To'g'ridan-to'g'ri bola ResponsiveContainer — flex bilan to'liq cho'ziladi
                  "[&>.recharts-responsive-container]:flex-1 [&>.recharts-responsive-container]:!h-auto [&>.recharts-responsive-container]:min-h-0",
                  // To'g'ridan-to'g'ri o'rab turuvchi div'larda qotgan balandlikni (h-72/h-64) bekor qilamiz
                  // (flex-1 BERMAYMIZ — aks holda grafiksiz/yondosh divlar ham cho'zilib layout buziladi)
                  "[&>div]:!h-auto [&>div]:min-h-0",
                  // Har qanday naslli grafik kamida 60vh — qotgan inline balandlikni (height={280|300}/h-72) yengadi
                  "[&_.recharts-responsive-container]:!min-h-[60vh] [&_.recharts-responsive-container]:!h-auto"
                )}
              >
                {children}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
