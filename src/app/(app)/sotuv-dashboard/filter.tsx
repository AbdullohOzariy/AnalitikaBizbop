"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, type ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { shiftPeriod } from "@/lib/period";

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
const PRESETS: { key: string; label: string; range: () => { start: string; end: string } }[] = [
  { key: "today",     label: "Bugun",     range: () => { const t = new Date(); t.setUTCHours(0,0,0,0); return { start: ymd(t), end: ymd(t) }; } },
  { key: "yesterday", label: "Kecha",     range: () => { const t = new Date(); t.setUTCHours(0,0,0,0); const y = new Date(t.getTime()-86400000); return { start: ymd(y), end: ymd(y) }; } },
  { key: "last7",     label: "7 kun",     range: () => { const e = new Date(); e.setUTCHours(0,0,0,0); const s = new Date(e.getTime()-6*86400000); return { start: ymd(s), end: ymd(e) }; } },
  { key: "thisMonth", label: "Joriy oy",  range: () => { const n = new Date(); return { start: ymd(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1))), end: ymd(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth()+1, 0))) }; } },
  { key: "lastMonth", label: "O'tgan oy", range: () => { const n = new Date(); return { start: ymd(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth()-1, 1))), end: ymd(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0))) }; } },
];

function SotuvFilterInner({
  branches, start, end, branchId,
}: {
  branches: { id: number; name: string }[];
  start: string;
  end: string;
  branchId?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  // Server yangi sana bersa (navigatsiya/orqaga) lokal holatni sinxronlaymiz
  const [seen, setSeen] = useState(`${start}|${end}`);
  if (seen !== `${start}|${end}`) { setSeen(`${start}|${end}`); setS(start); setE(end); }

  const nav = (changes: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) { if (!v || v === "all") p.delete(k); else p.set(k, v); }
    router.push(`${pathname}?${p.toString()}`);
  };
  const onDate = (which: "start" | "end", v: string) => {
    if (which === "start") setS(v); else setE(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) nav({ [which]: v });
  };
  const shift = (dir: 1 | -1) => {
    const next = shiftPeriod(s, e, dir);
    if (!next) return;
    setS(next.start); setE(next.end);
    nav({ start: next.start, end: next.end });
  };
  const branchItems = { all: "Barcha filiallar", ...Object.fromEntries(branches.map((b) => [String(b.id), b.name])) };
  const activePreset = PRESETS.find((p) => { const r = p.range(); return r.start === s && r.end === e; })?.key;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Button variant="outline" onClick={() => shift(-1)} className="h-9 w-9 shrink-0 p-0" title="Oldingi davr" aria-label="Oldingi davr">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Boshlanish</Label>
          <Input type="date" value={s} onChange={(ev) => onDate("start", ev.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tugash</Label>
          <Input type="date" value={e} onChange={(ev) => onDate("end", ev.target.value)} className="h-9 w-40" />
        </div>
        <Button variant="outline" onClick={() => shift(1)} className="h-9 w-9 shrink-0 p-0" title="Keyingi davr" aria-label="Keyingi davr">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Filial</Label>
          <Select items={branchItems} value={branchId ? String(branchId) : "all"} onValueChange={(v) => nav({ branchId: v ?? "all" })}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha filiallar</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = activePreset === p.key;
          return (
            <button key={p.key} type="button"
              onClick={() => { const r = p.range(); setS(r.start); setE(r.end); nav({ start: r.start, end: r.end }); }}
              className={cn("h-7 rounded-full px-3 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// useSearchParams Suspense chegarasini talab qiladi (statik prerender'da xato) —
// wrapper barcha ishlatish joylarini qamraydi.
export function SotuvFilter(props: ComponentProps<typeof SotuvFilterInner>) {
  return (
    <Suspense fallback={null}>
      <SotuvFilterInner {...props} />
    </Suspense>
  );
}
