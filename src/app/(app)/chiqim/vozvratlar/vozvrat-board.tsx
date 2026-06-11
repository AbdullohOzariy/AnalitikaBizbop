"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { VOZVRAT_HOLATLAR as HOLATLAR, VOZVRAT_HOLAT_LABEL as HOLAT_LABEL } from "@/lib/spisaniya/labels";
import { vozvratHolatAction } from "./actions";
import { VozvratCard, type VozvratCardData } from "./vozvrat-card";

const COLUMN_ACCENT: Record<string, string> = {
  xabar_berildi: "border-t-blue-500",
  saqlash_xonasida: "border-t-violet-500",
  yuborildi: "border-t-amber-500",
  qaytarildi: "border-t-primary",
  qaytarilmadi: "border-t-destructive",
};

export function VozvratBoard({ vozvratlar, canEdit }: { vozvratlar: VozvratCardData[]; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  // Server'dan yangi ma'lumot kelganda holatni qayta o'rnatamiz (render paytida, effektsiz).
  const [prev, setPrev] = useState(vozvratlar);
  const [items, setItems] = useState(vozvratlar);
  if (prev !== vozvratlar) {
    setPrev(vozvratlar);
    setItems(vozvratlar);
  }

  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [qDialog, setQDialog] = useState<null | { id: number }>(null);
  const [qSabab, setQSabab] = useState("");

  function commit(id: number, status: string, qaytarilmadiSabab?: string) {
    const before = items;
    // Optimistik: kartani darhol ko'chiramiz.
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, status, qaytarilmadi_sabab: qaytarilmadiSabab ?? (status === "qaytarilmadi" ? i.qaytarilmadi_sabab : null) } : i)));
    start(async () => {
      const res = await vozvratHolatAction({ id, status, qaytarilmadiSabab });
      if (res.ok) {
        toast.success("Holat yangilandi.");
        router.refresh();
      } else {
        setItems(before); // qaytarib qo'yamiz
        toast.error(res.error ?? "Xato.");
      }
    });
  }

  function handleDrop(status: string) {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!canEdit || id == null) return;
    const card = items.find((i) => i.id === id);
    if (!card || card.status === status) return;
    if (status === "qaytarilmadi") {
      // Sabab majburiy — dialog ochamiz.
      setQSabab(card.qaytarilmadi_sabab ?? "");
      setQDialog({ id });
      return;
    }
    commit(id, status);
  }

  return (
    <>
      {canEdit ? (
        <p className="text-xs text-muted-foreground">
          Kartani ustundan ustunga <strong>sudrab</strong> holatini o&apos;zgartiring (yoki kartadagi
          «Holat» tugmasidan). Mobil qurilmada «Holat» tugmasidan foydalaning.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Faqat ko&apos;rish rejimi.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {HOLATLAR.map((st) => {
          const colItems = items.filter((i) => i.status === st);
          const colSumma = colItems.reduce((a, i) => a + i.summa, 0);
          const isOver = overCol === st;
          return (
            <div
              key={st}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== st) setOverCol(st); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === st ? null : c)); }}
              onDrop={() => handleDrop(st)}
              className={cn(
                "rounded-2xl border border-t-4 border-border bg-muted/30 transition-colors",
                COLUMN_ACCENT[st],
                isOver && dragId != null && "bg-primary/10 ring-2 ring-primary/40"
              )}
            >
              <div className="border-b border-border/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{HOLAT_LABEL[st]}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {colItems.length}
                  </span>
                </div>
                {/* Ustun umumiy summasi */}
                <p className="mt-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                  {colSumma > 0 ? formatUZS(colSumma) : "—"}
                </p>
              </div>
              <div className="min-h-[80px] space-y-2.5 p-2.5">
                {colItems.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {isOver && dragId != null ? "Shu yerga tashlang" : "Bo'sh"}
                  </p>
                ) : (
                  colItems.map((v) => (
                    <div
                      key={v.id}
                      draggable={canEdit && !isPending}
                      onDragStart={(e) => { if (!canEdit) return; setDragId(v.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className={cn(
                        "group relative",
                        canEdit && "cursor-grab active:cursor-grabbing",
                        dragId === v.id && "opacity-50"
                      )}
                    >
                      {canEdit && (
                        <GripVertical className="pointer-events-none absolute right-1.5 top-1.5 z-10 h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                      <VozvratCard v={v} canEdit={canEdit} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* "Qaytarilmadi"ga tashlanganda sabab so'raladi */}
      <Dialog open={!!qDialog} onOpenChange={(o) => !o && setQDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Qaytarilmadi sababi</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Mahsulot nega qaytarilmadi? Sabab kiritilishi shart.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sabab</Label>
            <Input
              value={qSabab}
              onChange={(e) => setQSabab(e.target.value)}
              disabled={isPending}
              className="h-10 rounded-xl"
              placeholder="Nega qaytarilmadi?"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && qSabab.trim() && qDialog) {
                  commit(qDialog.id, "qaytarilmadi", qSabab.trim());
                  setQDialog(null);
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setQDialog(null)}>
              Bekor
            </Button>
            <Button
              className="rounded-xl"
              disabled={isPending || !qSabab.trim()}
              onClick={() => {
                if (qDialog) { commit(qDialog.id, "qaytarilmadi", qSabab.trim()); setQDialog(null); }
              }}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
