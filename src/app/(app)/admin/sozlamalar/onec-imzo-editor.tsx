"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldAlert, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { onecImzoTalabAction } from "./actions";

/**
 * HMAC imzo — 1C so'rovlarini haqiqiyligini tasdiqlash.
 *
 * NEGA TUGMA BOR: imzoni majburiy qilish 1C tomon imzolashni qo'shmagan bo'lsa
 * oqimni butunlay to'xtatadi. Shuning uchun "hamma so'rov imzolangan"ligini
 * ko'rsatib, keyin yoqishga ruxsat beramiz.
 */
export function OnecImzoEditor({
  majburiy,
  sirSozlangan,
  jami,
  imzolangan,
}: {
  majburiy: boolean;
  sirSozlangan: boolean;
  jami: number;
  imzolangan: number;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const hammasiImzolangan = jami > 0 && imzolangan === jami;
  const tayyor = sirSozlangan && hammasiImzolangan;

  const almashtir = (yoq: boolean) =>
    start(async () => {
      const res = await onecImzoTalabAction(yoq);
      if (res.ok) {
        toast.success(yoq ? "Imzo endi majburiy." : "Imzo majburiyligi bekor qilindi.");
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Imzo — so&apos;rov tanasidan va vaqtdan hisoblangan maxfiy kod. Kalit hech
        qachon tarmoqqa chiqmaydi, shuning uchun so&apos;rovni ushlab olgan odam
        ham o&apos;zi yangisini yasay olmaydi. <b>HTTP</b> orqali qabul qilishda shu
        yagona haqiqiy himoya.
      </p>

      {/* ── Holat ── */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Holat
          ok={sirSozlangan}
          matn={
            sirSozlangan
              ? "Kalit serverda sozlangan"
              : "Kalit yo'q — ONEC_INGEST_SECRET"
          }
        />
        <Holat
          ok={hammasiImzolangan}
          matn={
            jami === 0
              ? "Hali so'rov kelmagan"
              : `${imzolangan.toLocaleString("uz-UZ")} / ${jami.toLocaleString("uz-UZ")} so'rov imzolangan`
          }
        />
      </div>

      {/* ── Tugma ── */}
      {majburiy ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/[0.08] px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            Imzo <b>majburiy</b> — imzosiz so&apos;rov qabul qilinmaydi.
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => almashtir(false)}
            className="h-8 text-xs text-muted-foreground"
          >
            {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Bekor qilish
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg bg-amber-500/[0.09] px-3 py-2 text-xs">
            Hozir imzo <b>ixtiyoriy</b>: kelgani tekshiriladi, kelmagani ham
            o&apos;tkaziladi. 1C imzolashni qo&apos;shgach majburiy qiling.
          </div>
          <Button
            size="sm"
            variant={tayyor ? "default" : "outline"}
            disabled={isPending || !sirSozlangan}
            onClick={() => almashtir(true)}
            className="h-8 w-full gap-1.5 text-xs"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            Imzoni majburiy qilish
          </Button>
          {sirSozlangan && !hammasiImzolangan && jami > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⚠️ {(jami - imzolangan).toLocaleString("uz-UZ")} ta so&apos;rov
              imzosiz kelgan — hozir yoqsangiz 1C oqimi to&apos;xtaydi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Holat({ ok, matn }: { ok: boolean; matn: string }) {
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
      <Icon className={cn("h-4 w-4 shrink-0", ok ? "text-primary" : "text-muted-foreground")} />
      <span className={cn(!ok && "text-muted-foreground")}>{matn}</span>
    </div>
  );
}
