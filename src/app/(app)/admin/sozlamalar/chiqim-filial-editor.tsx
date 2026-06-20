"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Check } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { chiqimFilialBoglaAction } from "./actions";

const NONE = "__none__";

export type ChiqimFilialBranch = { id: number; name: string; chiqimFilial: string | null };

/**
 * Analitika filialini (Branch) bizbop "yozuvlar.filial" nomiga bog'lash.
 * Foyda → Iyerarxiya hisobotidagi chiqim shu nom bo'yicha filtrlanadi.
 */
export function ChiqimFilialEditor({
  branches, bizbopFilials,
}: {
  branches: ChiqimFilialBranch[];
  bizbopFilials: string[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  // SelectValue uchun value→label xaritasi: bizbop nomlari + allaqachon bog'langan
  // (lekin ro'yxatda bo'lmagan) nomlar ham ko'rinishi uchun.
  const items = useMemo(() => {
    const extra = branches.map((b) => b.chiqimFilial).filter((x): x is string => !!x);
    const all = Array.from(new Set([...bizbopFilials, ...extra]));
    return { [NONE]: "— Bog'lanmagan —", ...Object.fromEntries(all.map((f) => [f, f])) };
  }, [branches, bizbopFilials]);

  const onChange = (b: ChiqimFilialBranch, v: string | null) => {
    if (!v) return;
    const filial = v === NONE ? "" : v;
    if ((b.chiqimFilial ?? "") === filial) return;
    setSavingId(b.id);
    setSavedId(null);
    start(async () => {
      const res = await chiqimFilialBoglaAction({ branchId: b.id, filial });
      setSavingId(null);
      if (res.ok) {
        toast.success(filial ? `"${b.name}" → "${filial}" bog'landi.` : `"${b.name}" bog'lanishi olib tashlandi.`);
        setSavedId(b.id);
        router.refresh();
      } else {
        toast.error(res.error ?? "Xato.");
      }
    });
  };

  if (branches.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Analitika filiallari yo&apos;q.</p>;
  }

  return (
    <div className="space-y-3">
      {bizbopFilials.length === 0 && (
        <p className="rounded-lg bg-amber-500/[0.06] px-3 py-2 text-xs text-muted-foreground">
          Bizbop bazasidan filial nomlari topilmadi — chiqim yozuvlari hali yo&apos;q bo&apos;lishi mumkin.
        </p>
      )}
      <div className="divide-y divide-border/60">
        {branches.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {b.chiqimFilial
                    ? <span>Chiqim: <span className="text-foreground/80">{b.chiqimFilial}</span></span>
                    : <span className="opacity-60">Chiqim filiali bog&apos;lanmagan</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select items={items} value={b.chiqimFilial ?? NONE}
                onValueChange={(v) => onChange(b, v)} disabled={isPending}>
                <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Bog&apos;lanmagan —</SelectItem>
                  {bizbopFilials.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              {savingId === b.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                : savedId === b.id && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
