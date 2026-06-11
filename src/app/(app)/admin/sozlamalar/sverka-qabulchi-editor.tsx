"use client";

/** Sverka "Qabul qildi" ro'yxati — qabul qiluvchi xodim ismlari (mini app'da tanlanadi). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sverkaQabulchiQoshAction, sverkaQabulchiOchirAction } from "./actions";

export type QabulchiRow = { id: number; ism: string };

export function SverkaQabulchiEditor({ qabulchilar }: { qabulchilar: QabulchiRow[] }) {
  const router = useRouter();
  const [ism, setIsm] = useState("");
  const [isPending, start] = useTransition();

  const add = () => {
    if (!ism.trim()) { toast.error("Ism kiriting."); return; }
    start(async () => {
      const res = await sverkaQabulchiQoshAction(ism.trim());
      if (res.ok) { toast.success("Qo'shildi."); setIsm(""); router.refresh(); }
      else toast.error(res.error);
    });
  };

  const remove = (q: QabulchiRow) => {
    if (!confirm(`"${q.ism}" ro'yxatdan olinsinmi?`)) return;
    start(async () => {
      const res = await sverkaQabulchiOchirAction(q.id);
      if (res.ok) { toast.success("O'chirildi."); router.refresh(); }
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Mini app&apos;dagi &quot;Qabul qildi&quot; qadamida shu ismlar tanlov sifatida chiqadi.
      </p>
      <div className="flex gap-2">
        <Input value={ism} onChange={(e) => setIsm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Qabul qiluvchi ismi..." disabled={isPending} className="h-9 max-w-xs" />
        <Button onClick={add} disabled={isPending} className="h-9 gap-1.5 shrink-0">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Qo&apos;shish
        </Button>
      </div>
      {qabulchilar.length === 0 ? (
        <p className="py-2 text-center text-xs italic text-muted-foreground">Hozircha ism qo&apos;shilmagan.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {qabulchilar.map((q) => (
            <li key={q.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{q.ism}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isPending}
                onClick={() => remove(q)} aria-label="O'chirish">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
