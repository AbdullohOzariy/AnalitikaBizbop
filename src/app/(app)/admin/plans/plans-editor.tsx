"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatMonthName, formatUZS } from "@/lib/format";
import { savePlansAction } from "./actions";

type Branch = { id: number; name: string };
type Category = { id: number; name: string };

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function PlansEditor({
  branches,
  categories,
  currentBranchId,
  currentYear,
  currentMonth,
  existing,
}: {
  branches: Branch[];
  categories: Category[];
  currentBranchId: number;
  currentYear: number;
  currentMonth: number;
  existing: Map<number, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [values, setValues] = useState<Map<number, string>>(
    () => new Map(categories.map((c) => [c.id, existing.get(c.id)?.toString() ?? ""]))
  );
  const [isPending, start] = useTransition();

  const updateUrl = (changes: Record<string, string | number>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) params.set(k, String(v));
    router.replace(`/admin/plans?${params.toString()}`);
  };

  const onValueChange = (categoryId: number, raw: string) => {
    const next = new Map(values);
    next.set(categoryId, raw);
    setValues(next);
  };

  const onSave = () => {
    const plans = categories.map((c) => {
      const raw = values.get(c.id)?.replace(/[\s,]/g, "") ?? "";
      return { categoryId: c.id, amount: Number(raw) || 0 };
    });
    start(async () => {
      const res = await savePlansAction({
        branchId: currentBranchId,
        year: currentYear,
        month: currentMonth,
        plans,
      });
      if (res.ok) toast.success(`${res.saved} ta reja saqlandi.`);
      else toast.error(res.error);
    });
  };

  const total = [...values.values()].reduce((sum, raw) => {
    const n = Number(raw.replace(/[\s,]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filtr va kiritish</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Filial</Label>
            <Select
              value={String(currentBranchId)}
              onValueChange={(v) => updateUrl({ branchId: v ?? "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Yil</Label>
            <Select
              value={String(currentYear)}
              onValueChange={(v) => updateUrl({ year: v ?? "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Oy</Label>
            <Select
              value={String(currentMonth)}
              onValueChange={(v) => updateUrl({ month: v ?? "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatMonthName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kategoriya</TableHead>
              <TableHead className="w-72">Reja (UZS)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Input
                    inputMode="numeric"
                    placeholder="0"
                    value={values.get(c.id) ?? ""}
                    onChange={(e) => onValueChange(c.id, e.target.value)}
                    disabled={isPending}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Jami reja:</span>{" "}
            <span className="font-semibold">{formatUZS(total)} so'm</span>
          </div>
          <Button onClick={onSave} disabled={isPending}>
            {isPending ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
