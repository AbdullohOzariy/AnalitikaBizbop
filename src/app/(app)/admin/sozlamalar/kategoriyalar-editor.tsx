"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tag, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { KategoriyaSoni } from "@/lib/spisaniya/db";
import {
  kategoriyaQoshishAction, kategoriyaYangilaAction, kategoriyaOchirAction,
} from "./actions";

export function KategoriyalarEditor({ kategoriyalar }: { kategoriyalar: KategoriyaSoni[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [edit, setEdit] = useState<null | { id?: number; nomi: string }>(null);
  const [ochir, setOchir] = useState<null | KategoriyaSoni>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const onSave = () => {
    if (!edit) return;
    const nomi = edit.nomi.trim();
    if (!nomi) { toast.error("Kategoriya nomi kerak."); return; }
    if (edit.id)
      run(() => kategoriyaYangilaAction(edit.id!, nomi), "Kategoriya yangilandi.", () => setEdit(null));
    else
      run(() => kategoriyaQoshishAction(nomi), "Kategoriya qo'shildi.", () => setEdit(null));
  };

  return (
    <div className="space-y-3">
      {kategoriyalar.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Hozircha kategoriya yo&apos;q.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {kategoriyalar.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{k.nomi}</span>
                <span className="shrink-0 text-xs text-muted-foreground">· {k.soni} ta</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={isPending}
                  onClick={() => setEdit({ id: k.id, nomi: k.nomi })} title="Tahrirlash">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                  disabled={isPending} onClick={() => setOchir(k)} title="O'chirish">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full rounded-xl" disabled={isPending}
        onClick={() => setEdit({ nomi: "" })}>
        <Plus className="mr-1.5 h-4 w-4" /> Kategoriya qo&apos;shish
      </Button>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Kategoriyani tahrirlash" : "Yangi kategoriya"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {edit?.id ? "Nom o'zgartirilsa, yozuvlardagi nom ham yangilanadi." : "Yangi kategoriya nomini kiriting."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nomi</Label>
            <Input value={edit?.nomi ?? ""} disabled={isPending} className="h-10 rounded-xl"
              placeholder="Sut mahsulotlari" autoFocus
              onChange={(e) => setEdit((s) => s && { ...s, nomi: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onSave()} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setEdit(null)}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onSave}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kategoriyani o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.nomi}</strong> o&apos;chiriladi. Yozuvlar o&apos;chmaydi — ulardagi kategoriya bo&apos;shatiladi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setOchir(null)}>Bekor</Button>
            <Button variant="destructive" className="rounded-xl" disabled={isPending}
              onClick={() => ochir && run(() => kategoriyaOchirAction(ochir.id), "Kategoriya o'chirildi.", () => setOchir(null))}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
