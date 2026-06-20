"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerOption = { id: string; label: string; hint?: string };

/**
 * Qidiruvli tekis ro'yxat tanlagich (uzun select'lar uchun, masalan yuzlab
 * yetkazib beruvchi). Trigger bosilganda Dialog ochiladi — qidiruv + filtrlangan
 * ro'yxat. SubcatTreePicker bilan bir xil UX, lekin tekis ro'yxat uchun.
 */
export function SearchablePicker({
  options, value, onPick, disabled,
  placeholder = "Tanlash", searchPlaceholder = "Qidirish...", title = "Tanlang",
  triggerClassName,
}: {
  options: PickerOption[];
  value: string | null;
  onPick: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  title?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const Q = q.trim().toUpperCase();
  const filtered = useMemo(
    () => (Q
      ? options.filter((o) => o.label.toUpperCase().includes(Q) || (o.hint ?? "").toUpperCase().includes(Q))
      : options),
    [options, Q]
  );
  const selected = options.find((o) => o.id === value);
  const pick = (id: string) => { onPick(id); setOpen(false); setQ(""); };

  return (
    <>
      <Button type="button" variant="outline" disabled={disabled}
        className={cn("h-10 w-full justify-between rounded-xl font-normal", triggerClassName)}
        onClick={() => setOpen(true)}>
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">Ro&apos;yxatdan tanlang yoki qidiring.</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder={searchPlaceholder} className="h-9 pl-8 pr-8" />
            {q && (
              <button onClick={() => setQ("")} aria-label="Tozalash"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border/60">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Topilmadi.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {filtered.map((o) => (
                  <button key={o.id} onClick={() => pick(o.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{o.hint}</span>}
                    {value === o.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
