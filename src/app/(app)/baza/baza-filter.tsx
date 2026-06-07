"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

type Branch = { id: number; name: string };
type Category = { id: number; name: string };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Sana presetlari (UTC kun)
const PRESETS: { key: string; label: string; range: () => { start: string; end: string } }[] = [
  { key: "today", label: "Bugun", range: () => { const t = new Date(); t.setUTCHours(0, 0, 0, 0); return { start: ymd(t), end: ymd(t) }; } },
  { key: "yesterday", label: "Kecha", range: () => { const t = new Date(); t.setUTCHours(0, 0, 0, 0); const y = new Date(t.getTime() - 86400000); return { start: ymd(y), end: ymd(y) }; } },
  { key: "last7", label: "7 kun", range: () => { const e = new Date(); e.setUTCHours(0, 0, 0, 0); const s = new Date(e.getTime() - 6 * 86400000); return { start: ymd(s), end: ymd(e) }; } },
  { key: "last30", label: "30 kun", range: () => { const e = new Date(); e.setUTCHours(0, 0, 0, 0); const s = new Date(e.getTime() - 29 * 86400000); return { start: ymd(s), end: ymd(e) }; } },
  { key: "thisMonth", label: "Joriy oy", range: () => { const n = new Date(); const s = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)); const e = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)); return { start: ymd(s), end: ymd(e) }; } },
  { key: "lastMonth", label: "O'tgan oy", range: () => { const n = new Date(); const s = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)); const e = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)); return { start: ymd(s), end: ymd(e) }; } },
];

export function BazaFilter({
  basePath,
  branches,
  categories,
  defaultStart,
  defaultEnd,
  defaultBranchId,
  defaultCategoryId,
  defaultSearch,
  showCategory = false,
  showSearch = false,
}: {
  basePath: string;
  branches: Branch[];
  categories?: Category[];
  defaultStart: string;
  defaultEnd: string;
  defaultBranchId?: string;
  defaultCategoryId?: string;
  defaultSearch?: string;
  showCategory?: boolean;
  showSearch?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [branchId, setBranchId] = useState(defaultBranchId ?? "all");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "all");
  const [search, setSearch] = useState(defaultSearch ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Server yangi default berganda lokal holatni qayta sinxronlaymiz
  const propsKey = `${defaultStart}|${defaultEnd}|${defaultBranchId ?? ""}|${defaultCategoryId ?? ""}|${defaultSearch ?? ""}`;
  const [seenKey, setSeenKey] = useState(propsKey);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setStart(defaultStart); setEnd(defaultEnd);
    setBranchId(defaultBranchId ?? "all"); setCategoryId(defaultCategoryId ?? "all");
    setSearch(defaultSearch ?? "");
  }

  // Har o'zgarish avtomatik qo'llanadi (Ko'rish tugmasi shart emas)
  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (!v || v === "all") p.delete(k); else p.set(k, v);
    }
    p.delete("page");
    router.replace(`${basePath}?${p.toString()}`, { scroll: false });
  };

  const onDate = (key: "start" | "end", value: string) => {
    if (key === "start") setStart(value); else setEnd(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value)) navigate({ [key]: value || undefined });
    }, 450);
  };
  const onSearch = (value: string) => {
    setSearch(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate({ q: value.trim() || undefined }), 450);
  };
  const onPreset = (s: string, e: string) => {
    setStart(s); setEnd(e); navigate({ start: s, end: e });
  };

  const reset = () => {
    clearTimeout(debounce.current);
    setStart(""); setEnd(""); setBranchId("all"); setCategoryId("all"); setSearch("");
    router.replace(basePath, { scroll: false });
  };

  const hasFilters =
    start || end || (branchId && branchId !== "all") ||
    (showCategory && categoryId !== "all") ||
    (showSearch && search.trim());
  const activePreset = PRESETS.find((p) => { const r = p.range(); return r.start === start && r.end === end; })?.key;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {/* Filial */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Filial</Label>
          <Select value={branchId} onValueChange={(v) => { const nv = v ?? "all"; setBranchId(nv); navigate({ branchId: nv }); }}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Barcha filiallar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha filiallar</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Kategoriya */}
        {showCategory && categories && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Kategoriya</Label>
            <Select value={categoryId} onValueChange={(v) => { const nv = v ?? "all"; setCategoryId(nv); navigate({ categoryId: nv }); }}>
              <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Barcha kategoriyalar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha kategoriyalar</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Davr */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Boshlanish</Label>
          <Input type="date" value={start} onChange={(e) => onDate("start", e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tugash</Label>
          <Input type="date" value={end} onChange={(e) => onDate("end", e.target.value)} className="h-9 w-40" />
        </div>

        {/* Qidiruv */}
        {showSearch && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mahsulot (nom / kod)</Label>
            <Input type="text" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Qidirish..." className="h-9 w-52" />
          </div>
        )}

        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={reset} className="h-9 gap-1.5 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Tozalash
          </Button>
        )}
      </div>

      {/* Sana presetlari */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = activePreset === p.key;
          return (
            <button key={p.key} type="button"
              onClick={() => { const r = p.range(); onPreset(r.start, r.end); }}
              className={cn(
                "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
