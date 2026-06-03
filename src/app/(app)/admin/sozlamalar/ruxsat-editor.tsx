"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/common/page";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { UserPlus, Trash2, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import type { BotRuxsat } from "@/lib/spisaniya/db";
import { ruxsatQoshishAction, ruxsatToggleAction, ruxsatOchirAction } from "./actions";

export function RuxsatEditor({ ruxsatlar }: { ruxsatlar: BotRuxsat[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [qoshish, setQoshish] = useState(false);
  const [tgId, setTgId] = useState("");
  const [ism, setIsm] = useState("");
  const [ochir, setOchir] = useState<null | BotRuxsat>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const onQoshish = () => {
    if (!/^\d{5,15}$/.test(tgId.trim())) { toast.error("Telegram ID raqam bo'lishi kerak."); return; }
    run(() => ruxsatQoshishAction({ telegramId: tgId.trim(), ism: ism.trim() }), "Foydalanuvchi qo'shildi.",
      () => { setQoshish(false); setTgId(""); setIsm(""); });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Faqat shu ro&apos;yxatdagi xodimlar botdan foydalana oladi. Foydalanuvchi botga{" "}
        <span className="font-mono">/start</span> yozsa, o&apos;z ID&apos;sini ko&apos;radi — shuni qo&apos;shing.
      </p>

      {ruxsatlar.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Hozircha ruxsat berilgan foydalanuvchi yo&apos;q.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {ruxsatlar.map((r) => (
            <div key={r.telegram_id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.ism || "(ismsiz)"}</div>
                  <div className="font-mono text-xs text-muted-foreground">ID: {r.telegram_id}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => run(() => ruxsatToggleAction(r.telegram_id, !r.aktiv), r.aktiv ? "Bloklandi." : "Faollashtirildi.")}
                  disabled={isPending} title="Holatni almashtirish">
                  <Pill tone={r.aktiv ? "green" : "muted"}>{r.aktiv ? "Faol" : "Bloklangan"}</Pill>
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                  disabled={isPending} onClick={() => setOchir(r)} title="O'chirish">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full rounded-xl" disabled={isPending} onClick={() => setQoshish(true)}>
        <UserPlus className="mr-1.5 h-4 w-4" /> Foydalanuvchi qo&apos;shish
      </Button>

      <Dialog open={qoshish} onOpenChange={(o) => { if (!o) { setQoshish(false); setTgId(""); setIsm(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Botga ruxsat berish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Xodimning Telegram ID&apos;sini kiriting (botga /start yozsa ko&apos;rinadi).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Telegram ID</Label>
              <Input value={tgId} disabled={isPending} className="h-10 rounded-xl font-mono" inputMode="numeric"
                placeholder="123456789" autoFocus onChange={(e) => setTgId(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ism (ixtiyoriy)</Label>
              <Input value={ism} disabled={isPending} className="h-10 rounded-xl"
                placeholder="Abdulloh" onChange={(e) => setIsm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onQoshish()} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending}
              onClick={() => { setQoshish(false); setTgId(""); setIsm(""); }}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onQoshish}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Qo'shish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ruxsatni o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.ism || ochir?.telegram_id}</strong> botdan foydalana olmaydi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setOchir(null)}>Bekor</Button>
            <Button variant="destructive" className="rounded-xl" disabled={isPending}
              onClick={() => ochir && run(() => ruxsatOchirAction(ochir.telegram_id), "O'chirildi.", () => setOchir(null))}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
