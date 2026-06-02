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

const STATUSES: [string, string][] = [
  ["kutilmoqda", "Kutilmoqda"],
  ["jarayonda",  "Jarayonda"],
  ["bajarildi",  "Bajarildi"],
  ["rad_etildi", "Rad etildi"],
];

export function VozvratFilter({
  filials,
  defaultStart,
  defaultEnd,
  defaultStatus,
  defaultFilial,
}: {
  filials: string[];
  defaultStart: string;
  defaultEnd: string;
  defaultStatus?: string;
  defaultFilial?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [status, setStatus] = useState(defaultStatus ?? "all");
  const [filial, setFilial] = useState(defaultFilial ?? "all");

  const apply = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) p.set("start", start);
    else p.delete("start");
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) p.set("end", end);
    else p.delete("end");
    if (status && status !== "all") p.set("status", status);
    else p.delete("status");
    if (filial && filial !== "all") p.set("filial", filial);
    else p.delete("filial");
    p.delete("page");
    router.replace(`/chiqim/vozvrat?${p.toString()}`);
  };

  const reset = () => {
    setStart("");
    setEnd("");
    setStatus("all");
    setFilial("all");
    router.replace("/chiqim/vozvrat");
  };

  const hasFilters =
    start ||
    end ||
    (status && status !== "all") ||
    (filial && filial !== "all");

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Status filtri */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Holat</Label>
        <Select value={status} onValueChange={(v: string | null) => setStatus(v ?? "all")}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Barcha holatlar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha holatlar</SelectItem>
            {STATUSES.map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filial filtri */}
      {filials.length > 0 && (
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

      {/* Boshlanish */}
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

      {/* Tugash */}
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
