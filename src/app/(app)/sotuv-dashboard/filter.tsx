"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const CUR_YEAR = new Date().getFullYear();
const YEARS = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];

export function SotuvFilter({
  branches, year, month, branchId,
}: {
  branches: { id: number; name: string }[];
  year: number;
  month: number;
  branchId?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const nav = (changes: Record<string, string>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (!v || v === "all") p.delete(k); else p.set(k, v);
    }
    router.push(`${pathname}?${p.toString()}`);
  };

  const monthItems = Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m]));
  const yearItems = Object.fromEntries(YEARS.map((y) => [String(y), String(y)]));
  const branchItems = {
    all: "Barcha filiallar",
    ...Object.fromEntries(branches.map((b) => [String(b.id), b.name])),
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Oy</Label>
        <Select items={monthItems} value={String(month)} onValueChange={(v) => v && nav({ month: v })}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Yil</Label>
        <Select items={yearItems} value={String(year)} onValueChange={(v) => v && nav({ year: v })}>
          <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Filial</Label>
        <Select items={branchItems} value={branchId ? String(branchId) : "all"} onValueChange={(v) => nav({ branchId: v ?? "all" })}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha filiallar</SelectItem>
            {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
