"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
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
import { Calendar } from "lucide-react";

type Branch = { id: number; name: string };

function fmtInput(d: Date): string {
  return d.toISOString().slice(0, 10);
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
    } else return;
    const ns = fmtInput(s), ne = fmtInput(e);
    setLocalStart(ns); setLocalEnd(ne);
    navigate({ start: ns, end: ne });
  };

  const setCompare = (mode: string | undefined) => {
    if (!mode) navigate({ compare: "none", cstart: undefined, cend: undefined });
    else navigate({ compare: mode });
  };

  const COMPARE_BTNS = [
    { key: "wow", label: "O'tgan hafta" },
    { key: "mom", label: "O'tgan oy" },
    { key: "yoy", label: "O'tgan yil" },
    { key: "custom", label: "Maxsus" },
  ] as const;

  const btnBase = "rounded-full text-[13px] font-medium h-9 px-4 border-none shadow-none transition-all";
  const btnInactive = `${btnBase} bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-[#10b981]/10 hover:text-[#10b981]`;
  const btnActive = `${btnBase} bg-[#10b981]/15 text-[#10b981] font-semibold`;
  const btnOff = `${btnBase} bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:bg-red-50 hover:text-red-400`;

  return (
    <Card className="rounded-[24px] border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden font-['Sora',sans-serif]">
      <CardContent className="pt-6 pb-6 px-8 space-y-4">
        {/* Period + filial */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-6 items-end">
          <div className="space-y-2">
            <Label htmlFor="d-start" className="text-[14px] text-gray-500 font-medium ml-1">Boshlanish</Label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                <Calendar className="h-4 w-4" />
              </div>
              <Input id="d-start" type="date" value={localStart}
                onChange={(e) => handleDateChange("start", e.target.value)}
                onBlur={(e) => handleDateBlur("start", e.target.value)}
                className="pl-12 rounded-full bg-gray-50 dark:bg-zinc-800 border-none shadow-none h-12 text-[14px] text-gray-900 dark:text-gray-100 cursor-pointer focus-visible:ring-1 focus-visible:ring-gray-300 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-end" className="text-[14px] text-gray-500 font-medium ml-1">Tugash</Label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                <Calendar className="h-4 w-4" />
              </div>
              <Input id="d-end" type="date" value={localEnd}
                onChange={(e) => handleDateChange("end", e.target.value)}
                onBlur={(e) => handleDateBlur("end", e.target.value)}
                className="pl-12 rounded-full bg-gray-50 dark:bg-zinc-800 border-none shadow-none h-12 text-[14px] text-gray-900 dark:text-gray-100 cursor-pointer focus-visible:ring-1 focus-visible:ring-gray-300 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-gray-500 font-medium ml-1">Filial</Label>
            <Select value={branchId ? String(branchId) : "all"}
              onValueChange={(v) => navigate({ branchId: !v || v === "all" ? undefined : v })}>
              <SelectTrigger className="rounded-full bg-gray-50 dark:bg-zinc-800 border-none shadow-none h-12 text-[14px] text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]">
                <SelectItem value="all">Barcha filiallar</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {(["today", "last7", "last30", "thisMonth", "lastMonth"] as const).map((p) => (
              <Button key={p} variant="ghost" onClick={() => setPreset(p)}
                className={btnInactive}>
                {p === "today" ? "Bugun" : p === "last7" ? "7 kun" : p === "last30" ? "30 kun" : p === "thisMonth" ? "Joriy oy" : "O'tgan oy"}
              </Button>
            ))}
          </div>
        </div>

        {/* Taqqoslash */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 dark:border-zinc-800">
          <span className="text-[13px] text-gray-400 font-medium mr-1">Taqqoslash:</span>
          {COMPARE_BTNS.map(({ key, label }) => (
            <Button key={key} variant="ghost" onClick={() => setCompare(compare === key ? undefined : key)}
              className={compare === key ? btnActive : btnInactive}>
              {label}
            </Button>
          ))}
          {compare && compare !== "none" && (
            <Button variant="ghost" onClick={() => setCompare(undefined)} className={btnOff}>
              ✕ O'chirish
            </Button>
          )}
        </div>

        {/* Maxsus taqqoslash sanalari */}
        {compare === "custom" && (
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <Label className="text-[13px] text-gray-400 ml-1">Taqqoslash boshlanish</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <Input type="date" value={localCstart}
                  onChange={(e) => handleCustomCompare("cstart", e.target.value)}
                  className="pl-12 rounded-full bg-gray-50 dark:bg-zinc-800 border-none shadow-none h-10 text-[13px] text-gray-700 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-gray-400 ml-1">Taqqoslash tugash</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <Input type="date" value={localCend}
                  onChange={(e) => handleCustomCompare("cend", e.target.value)}
                  className="pl-12 rounded-full bg-gray-50 dark:bg-zinc-800 border-none shadow-none h-10 text-[13px] text-gray-700 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
