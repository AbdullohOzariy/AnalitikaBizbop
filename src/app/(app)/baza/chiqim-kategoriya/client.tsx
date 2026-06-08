"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, Check } from "lucide-react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, SelectSeparator,
} from "@/components/ui/select";
import { toast } from "sonner";
import { setSpisaniyaLinkAction, autoMapByNameAction } from "./actions";

export type SubcatOpt = { id: number; name: string; catName: string; groupName: string };

// ─── Avto-bog'lash tugmasi ─────────────────────────────────────────────────────
export function AutoMapButton() {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const run = () => {
    start(async () => {
      const res = await autoMapByNameAction();
      if (res.ok) { toast.success(`Nomi bo'yicha ${res.linked} ta bog'landi.`); router.refresh(); }
      else toast.error(res.error);
    });
  };
  return (
    <button type="button" onClick={run} disabled={isPending}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
      Nomi bo&apos;yicha avto-bog&apos;lash
    </button>
  );
}

// ─── Per-row subkat tanlash ────────────────────────────────────────────────────
export function LinkSelect({
  botName, current, subcats, canEdit,
}: {
  botName: string;
  current: number | null;
  subcats: SubcatOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [val, setVal] = useState<string>(current ? String(current) : "none");
  const [isPending, start] = useTransition();

  // Bo'lim · Kategoriya bo'yicha guruhlangan
  const grouped = useMemo(() => {
    const m = new Map<string, SubcatOpt[]>();
    for (const s of subcats) {
      const key = `${s.groupName} · ${s.catName}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return [...m.entries()];
  }, [subcats]);

  const items = useMemo(
    () => ({ none: "— Bog'lanmagan —", ...Object.fromEntries(subcats.map((s) => [String(s.id), s.name])) }),
    [subcats]
  );

  const onChange = (v: string | null) => {
    const nv = v ?? "none";
    setVal(nv);
    start(async () => {
      const res = await setSpisaniyaLinkAction({ botName, categoryId: nv === "none" ? null : Number(nv) });
      if (res.ok) { toast.success("Saqlandi."); router.refresh(); }
      else { toast.error(res.error); setVal(current ? String(current) : "none"); }
    });
  };

  if (!canEdit) {
    return (
      <span className="text-sm text-muted-foreground">
        {current ? (subcats.find((s) => s.id === current)?.name ?? "—") : "—"}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select items={items} value={val} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger className="h-9 w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Bog&apos;lanmagan —</SelectItem>
          <SelectSeparator />
          {grouped.map(([label, opts]) => (
            <SelectGroup key={label}>
              <SelectLabel>{label}</SelectLabel>
              {opts.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {!isPending && val !== "none" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
    </div>
  );
}
