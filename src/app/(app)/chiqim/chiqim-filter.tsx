"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
import { Search, X } from "lucide-react";

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

export function ChiqimFilter({
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

  const apply = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) p.set("start", start);
    else p.delete("start");
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) p.set("end", end);
    else p.delete("end");
    if (!hideTur) {
      if (tur && tur !== "all") p.set("tur", tur);
      else p.delete("tur");
    }
    if (!hideFilial) {
      if (filial && filial !== "all") p.set("filial", filial);
      else p.delete("filial");
    }
    p.delete("page");
    router.replace(`${basePath}?${p.toString()}`);
  };

  const reset = () => {
    setStart("");
    setEnd("");
    setTur("all");
    setFilial("all");
    router.replace(basePath);
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
          <Select value={tur} onValueChange={(v: string | null) => setTur(v ?? "all")}>
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
          <Select value={filial} onValueChange={(v: string | null) => setFilial(v ?? "all")}>
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
          onChange={(e) => setStart(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="h-9 w-40"
        />
      </div>

      {/* Davr: tugash */}
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

      <Button size="sm" onClick={apply} className="h-9 gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Ko&apos;rish
      </Button>

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
