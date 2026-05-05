"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

function parseISO(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
function isFullMonth(s: Date, e: Date): boolean {
  return (
    s.getUTCDate() === 1 &&
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    e.getUTCDate() === lastDayOfMonth(e.getUTCFullYear(), e.getUTCMonth())
  );
}

function shiftPeriod(startStr: string, endStr: string, dir: 1 | -1): { start: string; end: string } | null {
  const s = parseISO(startStr);
  const e = parseISO(endStr);
  if (!s || !e || e < s) return null;

  if (isFullMonth(s, e)) {
    const y = s.getUTCFullYear();
    const m = s.getUTCMonth() + dir;
    const ns = new Date(Date.UTC(y, m, 1));
    const ne = new Date(Date.UTC(ns.getUTCFullYear(), ns.getUTCMonth() + 1, 0));
    return { start: fmt(ns), end: fmt(ne) };
  }

  const dayMs = 86_400_000;
  const lenDays = Math.round((e.getTime() - s.getTime()) / dayMs) + 1;
  const ns = new Date(s.getTime() + dir * lenDays * dayMs);
  const ne = new Date(e.getTime() + dir * lenDays * dayMs);
  return { start: fmt(ns), end: fmt(ne) };
}

export function PeriodFilter({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const navigate = (s: string, e: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) p.set("start", s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(e)) p.set("end", e);
    router.replace(`/report?${p.toString()}`);
  };

  const apply = () => navigate(start, end);

  const shift = (dir: 1 | -1) => {
    const next = shiftPeriod(start, end, dir);
    if (!next) return;
    setStart(next.start);
    setEnd(next.end);
    navigate(next.start, next.end);
  };

  const fullMonth = (() => {
    const s = parseISO(start);
    const e = parseISO(end);
    return s && e && isFullMonth(s, e);
  })();
  const shiftLabel = fullMonth ? "oy" : "davr";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => shift(-1)}
        className="h-9 w-9 p-0"
        title={`Oldingi ${shiftLabel}`}
        aria-label={`Oldingi ${shiftLabel}`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Boshlanish</Label>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Tugash</Label>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="h-9 w-40"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => shift(1)}
        className="h-9 w-9 p-0"
        title={`Keyingi ${shiftLabel}`}
        aria-label={`Keyingi ${shiftLabel}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button size="sm" onClick={apply} className="h-9 gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Ko'rish
      </Button>
    </div>
  );
}
