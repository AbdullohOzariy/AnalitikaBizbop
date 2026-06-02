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

type Branch = { id: number; name: string };
type Category = { id: number; name: string };

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

  const handleBranchChange = (value: string | null) => setBranchId(value ?? "all");
  const handleCategoryChange = (value: string | null) => setCategoryId(value ?? "all");

  const apply = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) p.set("start", start); else p.delete("start");
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) p.set("end", end); else p.delete("end");
    if (branchId && branchId !== "all") p.set("branchId", branchId); else p.delete("branchId");
    if (showCategory && categoryId && categoryId !== "all") p.set("categoryId", categoryId); else p.delete("categoryId");
    if (showSearch && search.trim()) p.set("q", search.trim()); else p.delete("q");
    p.delete("page"); // filter o'zgarganda birinchi sahifaga qaytish
    router.replace(`${basePath}?${p.toString()}`);
  };

  const reset = () => {
    setStart("");
    setEnd("");
    setBranchId("all");
    setCategoryId("all");
    setSearch("");
    router.replace(basePath);
  };

  const hasFilters =
    start || end || (branchId && branchId !== "all") ||
    (showCategory && categoryId !== "all") ||
    (showSearch && search.trim());

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Filial */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Filial</Label>
        <Select value={branchId} onValueChange={handleBranchChange}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Barcha filiallar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha filiallar</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kategoriya */}
      {showCategory && categories && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Kategoriya</Label>
          <Select value={categoryId} onValueChange={handleCategoryChange}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue placeholder="Barcha kategoriyalar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha kategoriyalar</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Davr */}
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

      {/* Mahsulot qidiruv */}
      {showSearch && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mahsulot (nom / kod)</Label>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="Qidirish..."
            className="h-9 w-52"
          />
        </div>
      )}

      <Button size="sm" onClick={apply} className="h-9 gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Ko&apos;rish
      </Button>

      {hasFilters && (
        <Button size="sm" variant="ghost" onClick={reset} className="h-9 gap-1.5 text-muted-foreground">
          <X className="h-3.5 w-3.5" />
          Tozalash
        </Button>
      )}
    </div>
  );
}
