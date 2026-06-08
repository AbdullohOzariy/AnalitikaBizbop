"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createExpenseAction, deleteExpenseAction } from "./actions";

const NF = new Intl.NumberFormat("uz-UZ");
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Harajat qo'shish formasi ──────────────────────────────────────────────────
export function ExpenseForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [isPending, start] = useTransition();

  const qtyN = parseFloat(qty) || 0;
  const priceN = parseFloat(price) || 0;
  const sum = qtyN * priceN;

  const reset = () => { setName(""); setQty(""); setPrice(""); setSpentAt(todayISO()); };

  const onAdd = () => {
    if (!name.trim()) { toast.error("Nom kiriting."); return; }
    if (qtyN <= 0) { toast.error("Miqdor 0 dan katta bo'lsin."); return; }
    start(async () => {
      const res = await createExpenseAction({ name: name.trim(), quantity: qtyN, unitPrice: priceN, spentAt });
      if (res.ok) { toast.success("Harajat qo'shildi."); reset(); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_1fr_1fr_auto]">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Nomi</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harajat nomi" disabled={isPending}
            onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Miqdori</Label>
          <Input type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" disabled={isPending} className="text-right tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Narxi (so&apos;m)</Label>
          <Input type="number" inputMode="numeric" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" disabled={isPending} className="text-right tabular-nums" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sana</Label>
          <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} disabled={isPending} />
        </div>
        <Button onClick={onAdd} disabled={isPending} className="h-9 gap-1.5">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Qo&apos;shish
        </Button>
      </div>
      <div className="mt-2 text-right text-sm text-muted-foreground">
        Summa: <span className="font-semibold tabular-nums text-foreground">{NF.format(Math.round(sum))} so&apos;m</span>
      </div>
    </div>
  );
}

// ─── Sana filtri ───────────────────────────────────────────────────────────────
export function ExpenseFilter({ start, end }: { start: string; end: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = (k: string, v: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (v) p.set(k, v); else p.delete(k);
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Boshlanish</Label>
        <Input type="date" defaultValue={start} onChange={(e) => nav("start", e.target.value)} className="h-9 w-40" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Tugash</Label>
        <Input type="date" defaultValue={end} onChange={(e) => nav("end", e.target.value)} className="h-9 w-40" />
      </div>
    </div>
  );
}

// ─── O'chirish tugmasi ─────────────────────────────────────────────────────────
export function DeleteExpenseButton({ id }: { id: number }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const onDelete = () => {
    if (!confirm("Bu harajatni o'chirasizmi?")) return;
    start(async () => {
      const res = await deleteExpenseAction(id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };
  return (
    <Button variant="ghost" size="icon" onClick={onDelete} disabled={isPending} className="h-8 w-8">
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
    </Button>
  );
}
