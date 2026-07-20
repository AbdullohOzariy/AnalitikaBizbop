"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, Trash2, Pencil, Check, X, ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Sabab } from "@/lib/spisaniya/db";
import { sababQoshAction, sababYangilaAction, sababOchirAction } from "./actions";

export function SabablarClient({ initial }: { initial: Sabab[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const [yangiNomi, setYangiNomi] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editNomi, setEditNomi] = useState("");
  const [ochir, setOchir] = useState<Sabab | null>(null);

  // Server manbaa: har muvaffaqiyatli amaldan keyin router.refresh() bilan qayta o'qiladi.
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    done?: () => void
  ) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const qoshish = () => {
    const nomi = yangiNomi.trim();
    if (!nomi) { toast.error("Sabab nomini kiriting."); return; }
    run(() => sababQoshAction(nomi), "Sabab qo'shildi.", () => setYangiNomi(""));
  };

  const saqla = () => {
    if (editId == null) return;
    const nomi = editNomi.trim();
    if (!nomi) { toast.error("Sabab nomini kiriting."); return; }
    run(() => sababYangilaAction({ id: editId, nomi }), "Nom yangilandi.", () => setEditId(null));
  };

  const toggleFaol = (s: Sabab) =>
    run(
      () => sababYangilaAction({ id: s.id, faol: !s.faol }),
      s.faol ? "Nofaol qilindi." : "Faollashtirildi."
    );

  // Qo'shni bilan tartibni almashtiradi (up = -1, down = +1). tartib UNIQUE emas — swap xavfsiz.
  const kochir = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= initial.length) return;
    const a = initial[index];
    const b = initial[j];
    start(async () => {
      const r1 = await sababYangilaAction({ id: a.id, tartib: b.tartib });
      const r2 = await sababYangilaAction({ id: b.id, tartib: a.tartib });
      if (r1.ok && r2.ok) router.refresh();
      else toast.error((!r1.ok && r1.error) || (!r2.ok && r2.error) || "Ko'chirishda xato.");
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        {/* Qo'shish formasi */}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); qoshish(); }}
        >
          <Input
            value={yangiNomi}
            disabled={isPending}
            className="h-10 flex-1 rounded-xl"
            placeholder="Yangi sabab nomi (masalan: Muddati o'tgan)"
            maxLength={255}
            onChange={(e) => setYangiNomi(e.target.value)}
          />
          <Button type="submit" className="h-10 rounded-xl" disabled={isPending || !yangiNomi.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Qo&apos;shish
          </Button>
        </form>

        {initial.length === 0 ? (
          <EmptyState
            title="Hozircha sabab yo'q"
            description="Yuqoridagi maydondan birinchi sababni qo'shing."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[70px] text-center">Tartib</TableHead>
                  <TableHead>Sabab</TableHead>
                  <TableHead className="w-[110px]">Holat</TableHead>
                  <TableHead className="w-[130px] text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initial.map((s, i) => {
                  const editing = editId === s.id;
                  return (
                    <TableRow key={s.id} className={cn("text-sm", !s.faol && "opacity-55")}>
                      {/* Tartib — yuqoriga/pastga ko'chirish */}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            disabled={isPending || i === 0}
                            onClick={() => kochir(i, -1)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            aria-label="Yuqoriga ko'chirish"
                            title="Yuqoriga"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isPending || i === initial.length - 1}
                            onClick={() => kochir(i, 1)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            aria-label="Pastga ko'chirish"
                            title="Pastga"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>

                      {/* Nomi — inline tahrir */}
                      <TableCell className="font-medium">
                        {editing ? (
                          <Input
                            value={editNomi}
                            disabled={isPending}
                            autoFocus
                            maxLength={255}
                            className="h-8 rounded-lg"
                            onChange={(e) => setEditNomi(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saqla(); }
                              if (e.key === "Escape") setEditId(null);
                            }}
                          />
                        ) : (
                          <span>{s.nomi}</span>
                        )}
                      </TableCell>

                      {/* Holat toggle */}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleFaol(s)}
                          disabled={isPending}
                          aria-label={`${s.nomi}: holatni almashtirish`}
                          title="Holatni almashtirish"
                          className="disabled:pointer-events-none"
                        >
                          <Pill tone={s.faol ? "green" : "muted"}>{s.faol ? "Faol" : "Nofaol"}</Pill>
                        </button>
                      </TableCell>

                      {/* Amallar */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {editing ? (
                            <>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 rounded-lg text-primary hover:text-primary"
                                disabled={isPending} onClick={saqla}
                                aria-label="Saqlash" title="Saqlash"
                              >
                                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 rounded-lg"
                                disabled={isPending} onClick={() => setEditId(null)}
                                aria-label="Bekor" title="Bekor"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 rounded-lg"
                                disabled={isPending}
                                onClick={() => { setEditId(s.id); setEditNomi(s.nomi); }}
                                aria-label={`${s.nomi} nomini tahrirlash`} title="Tahrirlash"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                                disabled={isPending} onClick={() => setOchir(s)}
                                aria-label={`${s.nomi} sababini o'chirish`} title="O'chirish"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* O'chirish tasdiq */}
      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sababni o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.nomi}</strong> o&apos;chiriladi. Eski yozuvlardagi bu sabab matni
              saqlanib qoladi, lekin miniappda tanlash uchun ko&apos;rinmaydi. Vaqtincha yashirish
              uchun o&apos;rniga <em>nofaol</em> qilishingiz mumkin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setOchir(null)}>
              Bekor
            </Button>
            <Button
              variant="destructive" className="rounded-xl" disabled={isPending}
              onClick={() => ochir && run(() => sababOchirAction(ochir.id), "Sabab o'chirildi.", () => setOchir(null))}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
