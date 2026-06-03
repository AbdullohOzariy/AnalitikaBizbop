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
import { Building2, Plus, Pencil, Trash2, Loader2, Hash } from "lucide-react";
import { toast } from "sonner";
import type { FilialToliq } from "@/lib/spisaniya/db";
import {
  filialQoshishAction, filialYangilaAction, filialOchirAction,
} from "./actions";

export function FilialarEditor({ filialar }: { filialar: FilialToliq[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  // Dialog holati: null=yopiq, {} = yangi, {id,...}=tahrir
  const [edit, setEdit] = useState<null | { id?: number; nomi: string; topic_id: string }>(null);
  const [ochir, setOchir] = useState<null | FilialToliq>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const onSave = () => {
    if (!edit) return;
    const nomi = edit.nomi.trim();
    if (!nomi) { toast.error("Filial nomi kerak."); return; }
    const topic_id = edit.topic_id.trim();
    if (edit.id) {
      run(() => filialYangilaAction({ id: edit.id!, nomi, topic_id }), "Filial yangilandi.", () => setEdit(null));
    } else {
      // Avval qo'shamiz; topic kiritilgan bo'lsa, qo'shilgach yangilash kerak —
      // soddaroq: qo'shish nomni yaratadi, topic'ni keyin tahrirdan kiritadi.
      run(() => filialQoshishAction(nomi), "Filial qo'shildi.", () => setEdit(null));
    }
  };

  const toggleAktiv = (f: FilialToliq) =>
    run(() => filialYangilaAction({ id: f.id, aktiv: !f.aktiv }), f.aktiv ? "Nofaol qilindi." : "Aktiv qilindi.");

  return (
    <div className="space-y-3">
      {filialar.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Hozircha filial yo&apos;q.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {filialar.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.nomi}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.topic_id
                      ? <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />Topik {f.topic_id}</span>
                      : <span className="opacity-60">Topik ulanmagan</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => toggleAktiv(f)} disabled={isPending}
                  aria-label={`${f.nomi}: holatni almashtirish`} title="Holatni almashtirish">
                  <Pill tone={f.aktiv ? "green" : "muted"}>{f.aktiv ? "Aktiv" : "Nofaol"}</Pill>
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={isPending}
                  onClick={() => setEdit({ id: f.id, nomi: f.nomi, topic_id: f.topic_id ?? "" })}
                  aria-label={`${f.nomi} filialini tahrirlash`} title="Tahrirlash">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                  disabled={isPending} onClick={() => setOchir(f)}
                  aria-label={`${f.nomi} filialini o'chirish`} title="O'chirish">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full rounded-xl" disabled={isPending}
        onClick={() => setEdit({ nomi: "", topic_id: "" })}>
        <Plus className="mr-1.5 h-4 w-4" /> Filial qo&apos;shish
      </Button>

      {/* Tahrir / qo'shish dialogi */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Filialni tahrirlash" : "Yangi filial"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {edit?.id ? "Nom va guruh topigini o'zgartiring." : "Filial nomini kiriting. Topikni keyin tahrirdan ulang."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nomi</Label>
              <Input value={edit?.nomi ?? ""} disabled={isPending} className="h-10 rounded-xl"
                placeholder="MegaCenter" autoFocus
                onChange={(e) => setEdit((s) => s && { ...s, nomi: e.target.value })} />
            </div>
            {edit?.id != null && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Guruh topic ID (ixtiyoriy)
                </Label>
                <Input value={edit?.topic_id ?? ""} disabled={isPending} className="h-10 rounded-xl font-mono"
                  placeholder="masalan: 42" inputMode="numeric"
                  onChange={(e) => setEdit((s) => s && { ...s, topic_id: e.target.value })} />
                <p className="text-xs text-muted-foreground">
                  Mavzuli guruhda shu filial yozuvlari yuboriladigan topik raqami. Bo&apos;sh — umumiy guruhga.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setEdit(null)}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onSave}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O'chirish tasdiq */}
      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Filialni o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.nomi}</strong> o&apos;chiriladi. Bu filialda yozuvlar bo&apos;lsa o&apos;chmaydi —
              o&apos;rniga uni <em>nofaol</em> qiling.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setOchir(null)}>Bekor</Button>
            <Button variant="destructive" className="rounded-xl" disabled={isPending}
              onClick={() => ochir && run(() => filialOchirAction(ochir.id), "Filial o'chirildi.", () => setOchir(null))}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
