"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route segment xato chegarasi (root layout ostidagi barcha sahifalar uchun).
 * Server Component render'ida ushlanmagan xato (masalan DB ulanish uzilishi) shu
 * ekranni chiqaradi — Next'ning ingliz tilidagi default ekrani o'rniga.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Railway log oqimiga — digest server logidagi yozuvga bog'lash imkonini beradi.
    console.error("[app/error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Xatolik yuz berdi</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Sahifani ko&apos;rsatishda kutilmagan xato bo&apos;ldi. Qayta urinib ko&apos;ring —
          muammo takrorlansa, sahifani yangilang yoki administratorga xabar bering.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground/70">Kod: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={() => unstable_retry()} variant="default" size="lg">
        <RefreshCw />
        Qayta urinish
      </Button>
    </div>
  );
}
