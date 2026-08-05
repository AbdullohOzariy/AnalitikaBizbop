"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldX, Loader2, Trash2, Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { onecIpRuxsatAction, onecIpOlibTashlaAction, onecIpTozalaAction } from "./actions";

export type IpRow = {
  ip: string;
  allowed: boolean;
  requests: number;
  firstSeen: string;
  lastSeen: string;
};

/**
 * 1C qabul endpointiga murojaat qilgan IP'lar.
 *
 * Cheklov "birinchi kelgan IP" prinsipida: 1C tomonidan IP so'rab o'tirilmaydi,
 * birinchi muvaffaqiyatli so'rov avtomatik ro'yxatga olinadi. Rad etilgan
 * urinishlar ham shu yerda ko'rinadi — ular 1C ning ikkinchi serveri bo'lishi
 * ham mumkin.
 */
export function OnecIpEditor({ rows, ruxsatEtilgan }: { rows: IpRow[]; ruxsatEtilgan: string[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(msg);
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });

  const radEtilgan = rows.filter((r) => !ruxsatEtilgan.includes(r.ip));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        1C ning IP&apos;sini so&apos;rab o&apos;tirmaymiz — <b>birinchi muvaffaqiyatli so&apos;rov</b>{" "}
        avtomatik ro&apos;yxatga olinadi, keyin faqat o&apos;sha IP qabul qilinadi.
        Boshqa IP&apos;dan urinish bo&apos;lsa quyida ko&apos;rinadi.
      </p>

      {ruxsatEtilgan.length === 0 && (
        <div className="rounded-lg bg-amber-500/[0.09] px-3 py-2 text-xs">
          Ro&apos;yxat bo&apos;sh — <b>keyingi so&apos;rov</b> kelgan IP ro&apos;yxatga olinadi.
        </div>
      )}

      {radEtilgan.length > 0 && (
        <div className="rounded-lg bg-destructive/[0.07] px-3 py-2 text-xs">
          <b>{radEtilgan.length} ta</b> boshqa IP&apos;dan urinish bo&apos;lgan — quyida ❌ bilan.
          Agar bu 1C ning boshqa serveri bo&apos;lsa, «Ruxsat» tugmasini bosing.
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Hali hech kim murojaat qilmagan.
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((r) => {
            const ruxsat = ruxsatEtilgan.includes(r.ip);
            return (
              <div key={r.ip} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {ruxsat ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <ShieldX className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <div className={cn("truncate font-mono text-sm", !ruxsat && "text-muted-foreground")}>
                      {r.ip}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.requests.toLocaleString("uz-UZ")} so&apos;rov · oxirgi: {r.lastSeen}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {ruxsat ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => onecIpOlibTashlaAction(r.ip), "Ro'yxatdan olib tashlandi.")}
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Olib tashlash
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => run(() => onecIpRuxsatAction(r.ip), "IP'ga ruxsat berildi.")}
                      className="h-8 gap-1 px-2 text-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Ruxsat
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ruxsatEtilgan.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() =>
            run(() => onecIpTozalaAction(), "Ro'yxat tozalandi — keyingi so'rov qayta olinadi.")
          }
          className="h-8 w-full gap-1.5 text-xs text-muted-foreground"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          Ro&apos;yxatni tozalash (1C serveri ko&apos;chsa)
        </Button>
      )}
    </div>
  );
}
