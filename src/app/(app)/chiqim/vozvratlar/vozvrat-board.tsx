"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { VOZVRAT_HOLATLAR as HOLATLAR, VOZVRAT_HOLAT_LABEL as HOLAT_LABEL } from "@/lib/spisaniya/labels";
import { vozvratHolatAction } from "./actions";
import { VozvratCard, type VozvratCardData } from "./vozvrat-card";

const COLUMN_ACCENT: Record<string, string> = {
  saqlash_xonasida: "border-t-violet-500",
  yuborildi: "border-t-amber-500",
  qaytarildi: "border-t-primary",
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

  function commit(id: number, status: string) {
    const before = items;
    // Optimistik: kartani darhol ko'chiramiz.
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, status } : i)));
    start(async () => {
      const res = await vozvratHolatAction({ id, status });
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
    commit(id, status);
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {canEdit
          ? <>Kartani ustundan ustunga <strong>sudrab</strong> holatini o&apos;zgartiring. Ustiga bossangiz — to&apos;liq ma&apos;lumot.</>
          : "Faqat ko'rish rejimi."}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
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
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                <span className="text-sm font-semibold">{HOLAT_LABEL[st]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">{colSumma > 0 ? formatUZS(colSumma, { compact: true }) : "—"}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">{colItems.length}</span>
                </div>
              </div>
              <div className="min-h-[60px] space-y-1.5 p-2">
                {colItems.length === 0 ? (
                  <p className="py-5 text-center text-xs text-muted-foreground">
                    {isOver && dragId != null ? "Shu yerga tashlang" : "Bo'sh"}
                  </p>
                ) : (
                  colItems.map((v) => (
                    <div
                      key={v.id}
                      draggable={canEdit && !isPending}
                      onDragStart={(e) => { if (!canEdit) return; setDragId(v.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className={cn(canEdit && "cursor-grab active:cursor-grabbing", dragId === v.id && "opacity-50")}
                    >
                      <VozvratCard v={v} canEdit={canEdit} />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
