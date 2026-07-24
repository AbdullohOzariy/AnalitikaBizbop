"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarRange, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** ISO kun (YYYY-MM-DD) — UTC. */
function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/** anchorEnd ga nisbatan preset davrlar. */
function presetsFor(anchorEnd: string): { key: string; label: string; start: string; end: string }[] {
  const e = new Date(`${anchorEnd}T00:00:00.000Z`);
  const y = e.getUTCFullYear();
  const m = e.getUTCMonth();
  const end = anchorEnd;
  const rolling = (months: number) => {
    // (months−1) oy oldingi oy boshidan anchorEnd gacha (oy-tekislangan).
    const startM = m - (months - 1);
    const yy = y + Math.floor(startM / 12);
    const mm = ((startM % 12) + 12) % 12;
    return iso(yy, mm, 1);
  };
  return [
    { key: "q", label: "Chorak", start: rolling(3), end },
    { key: "h", label: "Yarim yil", start: rolling(6), end },
    { key: "9m", label: "9 oy", start: rolling(9), end },
    { key: "y", label: "1 yil", start: rolling(12), end },
    { key: "ytd", label: "YTD", start: iso(y, 0, 1), end },
    { key: "prev", label: "O'tgan yil", start: iso(y - 1, 0, 1), end: iso(y - 1, 11, 31) },
  ];
}

export function PeriodPicker({
  start,
  end,
  anchorEnd,
}: {
  start: string;
  end: string;
  anchorEnd: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  // Server yangi davr berganda lokal inputlarni sinxronlaymiz.
  const propsKey = `${start}|${end}`;
  const [seen, setSeen] = useState(propsKey);
  if (seen !== propsKey) {
    setSeen(propsKey);
    setS(start);
    setE(end);
  }

  const go = (ns: string, ne: string) => {
    startTransition(() => router.push(`${pathname}?start=${ns}&end=${ne}`));
  };

  const presets = presetsFor(anchorEnd);

  return (
    <div className="shadow-card flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        Davr
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = p.start === start && p.end === end;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => go(p.start, p.end)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Dan</span>
          <Input type="date" value={s} onChange={(ev) => setS(ev.target.value)} className="h-8 w-[9.5rem]" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Gacha</span>
          <Input type="date" value={e} onChange={(ev) => setE(ev.target.value)} className="h-8 w-[9.5rem]" />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !s || !e || (s === start && e === end)}
          onClick={() => go(s, e)}
        >
          Qo'llash
        </Button>
      </div>
    </div>
  );
}
