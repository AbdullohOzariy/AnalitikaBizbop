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
import { todayTashkentISO } from "@/lib/date";
import type { QoldiqSort } from "@/lib/qoldiq";

type Branch = { id: number; name: string };
type Category = { id: number; name: string };

const SORT_OPTIONS: { value: QoldiqSort; label: string }[] = [
  { value: "qty", label: "Miqdor (ko'p → kam)" },
  { value: "code", label: "Kod" },
  { value: "name", label: "Nom" },
];

function QoldiqFilterInner({
  basePath,
  branches,
  categories,
  defaultDay,
  defaultBranchId,
  defaultCategoryId,
  defaultSearch,
  defaultSort,
}: {
  basePath: string;
  branches: Branch[];
  categories: Category[];
  defaultDay: string;
  defaultBranchId?: string;
  defaultCategoryId?: string;
  defaultSearch?: string;
  defaultSort: QoldiqSort;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [day, setDay] = useState(defaultDay);
  const [branchId, setBranchId] = useState(defaultBranchId ?? "all");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "all");
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [sort, setSort] = useState<QoldiqSort>(defaultSort);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Server yangi default berganda lokal holatni qayta sinxronlaymiz
  const propsKey = `${defaultDay}|${defaultBranchId ?? ""}|${defaultCategoryId ?? ""}|${defaultSearch ?? ""}|${defaultSort}`;
  const [seenKey, setSeenKey] = useState(propsKey);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setDay(defaultDay);
    setBranchId(defaultBranchId ?? "all");
    setCategoryId(defaultCategoryId ?? "all");
    setSearch(defaultSearch ?? "");
    setSort(defaultSort);
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

  const onDay = (value: string) => {
    setDay(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) navigate({ day: value });
    }, 350);
  };
  const onSearch = (value: string) => {
    setSearch(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate({ q: value.trim() || undefined }), 450);
  };

  const today = todayTashkentISO();
  const hasFilters =
    day !== today || branchId !== "all" || categoryId !== "all" || search.trim() !== "" || sort !== "qty";

  const reset = () => {
    clearTimeout(debounce.current);
    setDay(today); setBranchId("all"); setCategoryId("all"); setSearch(""); setSort("qty");
    router.replace(basePath, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Sana */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Sana</Label>
        <Input type="date" value={day} onChange={(e) => onDay(e.target.value)} className="h-9 w-40" />
      </div>

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

      {/* Qidiruv */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Mahsulot (nom / kod)</Label>
        <Input type="text" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Qidirish..." className="h-9 w-52" />
      </div>

      {/* Saralash */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Saralash</Label>
        <Select value={sort} onValueChange={(v) => { const nv = (v as QoldiqSort) ?? "qty"; setSort(nv); navigate({ sort: nv === "qty" ? undefined : nv }); }}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button size="sm" variant="ghost" onClick={reset} className="h-9 gap-1.5 text-muted-foreground">
          <X className="h-3.5 w-3.5" /> Tozalash
        </Button>
      )}
    </div>
  );
}

// useSearchParams Suspense chegarasini talab qiladi (statik prerender'da xato) —
// wrapper barcha ishlatish joylarini qamraydi.
export function QoldiqFilter(props: ComponentProps<typeof QoldiqFilterInner>) {
  return (
    <Suspense fallback={null}>
      <QoldiqFilterInner {...props} />
    </Suspense>
  );
}
