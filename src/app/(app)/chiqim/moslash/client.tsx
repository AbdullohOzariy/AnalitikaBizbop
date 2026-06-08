"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { chiqimYozuvYangilaAction } from "../actions";

export type SubOpt = { id: number; label: string; name: string; cat: string; group: string };

export function MoslashSelect({
  yozuvId, subs, canEdit,
}: {
  yozuvId: number;
  subs: SubOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [val, setVal] = useState<string>("none");
  const [isPending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<string, SubOpt[]>();
    for (const s of subs) {
      const key = `${s.group} · ${s.cat}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return [...m.entries()];
  }, [subs]);

  const items = useMemo(
    () => ({ none: "— Tanlang —", ...Object.fromEntries(subs.map((s) => [String(s.id), s.name])) }),
    [subs]
  );

  if (!canEdit) return <span className="text-xs text-muted-foreground">faqat System Admin</span>;

  const onChange = (v: string | null) => {
    if (!v || v === "none") return;
    setVal(v);
    const sub = subs.find((s) => s.id === Number(v));
    if (!sub) return;
    start(async () => {
      const res = await chiqimYozuvYangilaAction({ id: yozuvId, kategoriya: sub.label });
      if (res.ok) { toast.success(`"${sub.name}" biriktirildi.`); setSaved(true); router.refresh(); }
      else { toast.error(res.error); setVal("none"); }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select items={items} value={val} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger className="h-9 w-64"><SelectValue /></SelectTrigger>
        <SelectContent>
          {grouped.map(([label, opts]) => (
            <SelectGroup key={label}>
              <SelectLabel>{label}</SelectLabel>
              {opts.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : saved && <Check className="h-3.5 w-3.5 text-emerald-500" />}
    </div>
  );
}
