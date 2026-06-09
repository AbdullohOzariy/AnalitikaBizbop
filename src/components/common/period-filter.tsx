"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Building2, GitCompareArrows, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { shiftPeriod } from "@/lib/period";

type Branch = { id: number; name: string };

function fmtInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { key: "today", label: "Bugun" },
  { key: "yesterday", label: "Kecha" },
  { key: "last7", label: "7 kun" },
  { key: "last30", label: "30 kun" },
  { key: "thisMonth", label: "Joriy oy" },
  { key: "lastMonth", label: "O'tgan oy" },
] as const;

const COMPARE_BTNS = [
  { key: "wow", label: "O'tgan hafta" },
  { key: "mom", label: "O'tgan oy" },
  { key: "yoy", label: "O'tgan yil" },
  { key: "custom", label: "Maxsus" },
] as const;

/** Tanlangan oraliq qaysi presetga mos kelishini aniqlaydi (faol holat uchun). */
function presetRange(preset: string): { start: string; end: string } | null {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let s: Date, e: Date;
  if (preset === "today") { s = e = today; }
  else if (preset === "yesterday") { s = e = new Date(today.getTime() - 86400000); }
  else if (preset === "last7") { e = today; s = new Date(today.getTime() - 6 * 86400000); }
  else if (preset === "last30") { e = today; s = new Date(today.getTime() - 29 * 86400000); }
  else if (preset === "thisMonth") {
    s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  } else if (preset === "lastMonth") {
    s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else return null;
  return { start: fmtInput(s), end: fmtInput(e) };
}

export function PeriodFilter({
  start,
  end,
  branchId,
  branches,
  compare,
  cstart,
  cend,
}: {
  start: string;
  end: string;
  branchId?: number;
  branches: Branch[];
  compare?: string;
  cstart?: string;
  cend?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [localStart, setLocalStart] = useState(start);
  const [localEnd, setLocalEnd] = useState(end);
  const [localCstart, setLocalCstart] = useState(cstart ?? "");
  const [localCend, setLocalCend] = useState(cend ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const navigate = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  };

  const handleDateChange = (key: "start" | "end", value: string) => {
    if (key === "start") setLocalStart(value);
    else setLocalEnd(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) navigate({ [key]: value });
    }, 500);
  };

  const handleDateBlur = (key: "start" | "end", value: string) => {
    clearTimeout(debounceRef.current);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) navigate({ [key]: value });
  };

  const handleCustomCompare = (key: "cstart" | "cend", value: string) => {
    if (key === "cstart") setLocalCstart(value);
    else setLocalCend(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        navigate({ compare: "custom", [key]: value });
      }
    }, 500);
  };

  const setPreset = (preset: string) => {
    const r = presetRange(preset);
    if (!r) return;
    setLocalStart(r.start);
    setLocalEnd(r.end);
    navigate({ start: r.start, end: r.end });
  };

  const shift = (dir: 1 | -1) => {
    const next = shiftPeriod(localStart, localEnd, dir);
    if (!next) return;
    setLocalStart(next.start);
    setLocalEnd(next.end);
    navigate({ start: next.start, end: next.end });
  };

  const setCompare = (mode: string | undefined) => {
    if (!mode) navigate({ compare: "none", cstart: undefined, cend: undefined });
    else navigate({ compare: mode });
  };

  // Joriy oraliqqa mos faol preset
  const activePreset = useMemo(() => {
    for (const p of PRESETS) {
      const r = presetRange(p.key);
      if (r && r.start === localStart && r.end === localEnd) return p.key;
    }
    return null;
  }, [localStart, localEnd]);

  const activeCompare = compare && compare !== "none" ? compare : null;
  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;

  return (
    <Card className="rounded-2xl border-border/60 bg-card shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Asosiy qator: sana oralig'i + filial */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          {/* Sana oralig'i */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Davr
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                onClick={() => shift(-1)}
                className="h-11 w-11 shrink-0 rounded-xl border-border bg-background p-0 shadow-sm"
                title="Oldingi davr"
                aria-label="Oldingi davr"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Input
                  id="d-start"
                  type="date"
                  aria-label="Boshlanish sanasi"
                  value={localStart}
                  onChange={(e) => handleDateChange("start", e.target.value)}
                  onBlur={(e) => handleDateBlur("start", e.target.value)}
                  className="h-11 w-full rounded-xl border-border bg-background text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                />
              </div>
              <span className="hidden text-muted-foreground sm:inline">–</span>
              <div className="relative">
                <Input
                  id="d-end"
                  type="date"
                  aria-label="Tugash sanasi"
                  value={localEnd}
                  onChange={(e) => handleDateChange("end", e.target.value)}
                  onBlur={(e) => handleDateBlur("end", e.target.value)}
                  className="h-11 w-full rounded-xl border-border bg-background text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => shift(1)}
                className="h-11 w-11 shrink-0 rounded-xl border-border bg-background p-0 shadow-sm"
                title="Keyingi davr"
                aria-label="Keyingi davr"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filial */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> Filial
            </Label>
            <Select
              value={branchId ? String(branchId) : "all"}
              onValueChange={(v) => navigate({ branchId: !v || v === "all" ? undefined : v })}
            >
              <SelectTrigger className="h-11 w-full min-w-0 rounded-xl border-border bg-background px-3 text-sm shadow-sm focus:ring-2 focus:ring-ring/40 sm:w-64">
                <SelectValue>{selectedBranch?.name ?? "Barcha filiallar"}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80 rounded-xl">
                <SelectItem value="all">Barcha filiallar</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Preset chiplar */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const active = activePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                aria-pressed={active}
                className={cn(
                  "h-9 rounded-full px-4 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Taqqoslash */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <GitCompareArrows className="h-3.5 w-3.5" /> Taqqoslash
          </span>
          {COMPARE_BTNS.map(({ key, label }) => {
            const active = activeCompare === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCompare(active ? undefined : key)}
                aria-pressed={active}
                className={cn(
                  "h-9 rounded-full px-4 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active
                    ? "bg-accent/15 text-accent-foreground ring-1 ring-accent/40"
                    : "bg-muted text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
          {activeCompare && (
            <button
              type="button"
              onClick={() => setCompare(undefined)}
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="h-3.5 w-3.5" /> O'chirish
            </button>
          )}
        </div>

        {/* Maxsus taqqoslash sanalari */}
        {activeCompare === "custom" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="ml-0.5 text-xs text-muted-foreground">Taqqoslash boshlanishi</Label>
              <Input
                type="date"
                aria-label="Taqqoslash boshlanish sanasi"
                value={localCstart}
                onChange={(e) => handleCustomCompare("cstart", e.target.value)}
                className="h-10 w-full rounded-xl border-border bg-background text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="ml-0.5 text-xs text-muted-foreground">Taqqoslash tugashi</Label>
              <Input
                type="date"
                aria-label="Taqqoslash tugash sanasi"
                value={localCend}
                onChange={(e) => handleCustomCompare("cend", e.target.value)}
                className="h-10 w-full rounded-xl border-border bg-background text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
