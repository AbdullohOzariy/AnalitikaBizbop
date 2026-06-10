"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

// bot-db.ts Node.js-only (pg pool) — brauzerda import qilib bo'lmaydi.
// TUR_LABEL ni bu yerda takrorlaymiz (server prop sifatida ham uzatish mumkin edi,
// lekin bu turg'un qiymat — prop oqimiga hojat yo'q).
const TURS: [string, string][] = [
  ["spisaniya",   "Spisaniya"],
  ["vozvrat",     "Qayta ishlash"],
  ["kafe",        "Kafe"],
  ["ovqatlanish", "Ovqatlanish"],
  ["ichki_sotuv", "Ichki sotuv"],
];

function ChiqimFilterInner({
  filials,
  defaultStart,
  defaultEnd,
  defaultTur,
  defaultFilial,
  hideTur,
  hideFilial,
  basePath = "/chiqim",
}: {
  filials: string[];
  defaultStart: string;
  defaultEnd: string;
  defaultTur?: string;
  defaultFilial?: string;
  hideTur?: boolean;
  hideFilial?: boolean;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [tur, setTur] = useState(defaultTur ?? "all");
  const [filial, setFilial] = useState(defaultFilial ?? "all");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Server yangi default'larni uzatganda (navigatsiyadan keyin) lokal holatni
  // URL bilan qayta sinxronlaymiz — aks holda inputlar eski qiymatda "qotib" qoladi.
  const propsKey = `${defaultStart}|${defaultEnd}|${defaultTur ?? ""}|${defaultFilial ?? ""}`;
  const [seenKey, setSeenKey] = useState(propsKey);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setStart(defaultStart);
    setEnd(defaultEnd);
    setTur(defaultTur ?? "all");
    setFilial(defaultFilial ?? "all");
  }

  // Tanlangan qiymatlarni URL'ga yozadi (darhol fresh server render). Dashboard
  // PeriodFilter naqshi — har o'zgarish avtomatik qo'llanadi, tugma kutilmaydi.
  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (!v || v === "all") p.delete(k);
      else p.set(k, v);
    }
    p.delete("page");
    router.replace(`${basePath}?${p.toString()}`, { scroll: false });
  };

  const onDate = (key: "start" | "end", value: string) => {
    if (key === "start") setStart(value);
    else setEnd(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
        navigate({ [key]: value || undefined });
    }, 500);
  };

  const onDateCommit = (key: "start" | "end", value: string) => {
    clearTimeout(debounceRef.current);
    if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
      navigate({ [key]: value || undefined });
  };

  const onTur = (v: string | null) => {
    const next = v ?? "all";
    setTur(next);
    navigate({ tur: next });
  };

  const onFilial = (v: string | null) => {
    const next = v ?? "all";
    setFilial(next);
    navigate({ filial: next });
  };

  const reset = () => {
    clearTimeout(debounceRef.current);
    setStart("");
    setEnd("");
    setTur("all");
    setFilial("all");
    router.replace(basePath, { scroll: false });
  };

  const hasFilters =
    start ||
    end ||
    (tur && tur !== "all") ||
    (filial && filial !== "all");

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Tur filtri */}
      {!hideTur && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tur</Label>
          <Select value={tur} onValueChange={onTur}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Barcha turlar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha turlar</SelectItem>
              {TURS.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Filial filtri */}
      {!hideFilial && filials.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Filial</Label>
          <Select value={filial} onValueChange={onFilial}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Barcha filiallar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha filiallar</SelectItem>
              {filials.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Davr: boshlanish */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Boshlanish</Label>
        <Input
          type="date"
          value={start}
          onChange={(e) => onDate("start", e.target.value)}
          onBlur={(e) => onDateCommit("start", e.target.value)}
          className="h-9 w-40"
        />
      </div>

      {/* Davr: tugash */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Tugash</Label>
        <Input
          type="date"
          value={end}
          onChange={(e) => onDate("end", e.target.value)}
          onBlur={(e) => onDateCommit("end", e.target.value)}
          className="h-9 w-40"
        />
      </div>

      {hasFilters && (
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          className="h-9 gap-1.5 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Tozalash
        </Button>
      )}
    </div>
  );
}

// useSearchParams Suspense chegarasini talab qiladi (statik prerender'da xato) —
// wrapper barcha ishlatish joylarini qamraydi.
export function ChiqimFilter(props: ComponentProps<typeof ChiqimFilterInner>) {
  return (
    <Suspense fallback={null}>
      <ChiqimFilterInner {...props} />
    </Suspense>
  );
}
