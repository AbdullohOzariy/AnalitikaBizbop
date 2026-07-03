"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isoDay } from "@/lib/date";

const PRESETS: { key: string; label: string; range: () => { start: string; end: string } }[] = [
  { key: "last30", label: "30 kun", range: () => { const e = new Date(); e.setUTCHours(0, 0, 0, 0); const s = new Date(e.getTime() - 29 * 86400000); return { start: isoDay(s), end: isoDay(e) }; } },
  { key: "last90", label: "90 kun", range: () => { const e = new Date(); e.setUTCHours(0, 0, 0, 0); const s = new Date(e.getTime() - 89 * 86400000); return { start: isoDay(s), end: isoDay(e) }; } },
  { key: "thisMonth", label: "Joriy oy", range: () => { const n = new Date(); const s = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)); const e = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)); return { start: isoDay(s), end: isoDay(e) }; } },
  { key: "lastMonth", label: "O'tgan oy", range: () => { const n = new Date(); const s = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)); const e = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)); return { start: isoDay(s), end: isoDay(e) }; } },
];

function Inner({ basePath, defaultStart, defaultEnd }: { basePath: string; defaultStart: string; defaultEnd: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const key = `${defaultStart}|${defaultEnd}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) { setSeen(key); setStart(defaultStart); setEnd(defaultEnd); }

  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) { if (!v) p.delete(k); else p.set(k, v); }
    router.replace(`${basePath}?${p.toString()}`, { scroll: false });
  };
  const onDate = (k: "start" | "end", value: string) => {
    if (k === "start") setStart(value); else setEnd(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value)) navigate({ [k]: value || undefined }); }, 450);
  };
  const onPreset = (s: string, e: string) => { setStart(s); setEnd(e); navigate({ start: s, end: e }); };
  const activePreset = PRESETS.find((p) => { const r = p.range(); return r.start === start && r.end === end; })?.key;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Boshlanish</Label>
          <Input type="date" value={start} onChange={(e) => onDate("start", e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tugash</Label>
          <Input type="date" value={end} onChange={(e) => onDate("end", e.target.value)} className="h-9 w-40" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => { const r = p.range(); onPreset(r.start, r.end); }}
            className={cn("h-7 rounded-full px-3 text-xs font-medium transition-colors",
              activePreset === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LogistikaFilter(props: { basePath: string; defaultStart: string; defaultEnd: string }) {
  return <Suspense fallback={null}><Inner {...props} /></Suspense>;
}
