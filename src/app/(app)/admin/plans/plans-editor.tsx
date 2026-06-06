"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { formatMonthName } from "@/lib/format";
import { savePlansAction, loadPrevMonthPlansAction } from "./actions";

type Branch = { id: number; name: string };
type Category = { id: number; name: string };

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function stripFmt(s: string) {
  return s.replace(/\D/g, "");
}
function applyFmt(s: string) {
  const n = parseInt(stripFmt(s), 10);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("ru-RU") : "";
}
function toNum(s: string) {
  return Number(stripFmt(s)) || 0;
}

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
  const savedBaseline = useRef<Map<number, number>>(
    new Map(categories.map((c) => [c.id, existing.get(c.id) ?? 0]))
  );
  const [isSaving, startSave] = useTransition();
  const [isCopying, startCopy] = useTransition();

  const updateUrl = (changes: Record<string, string | number>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) params.set(k, String(v));
    router.replace(`/admin/plans?${params.toString()}`);
  };

  const navigateMonth = (delta: number) => {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    updateUrl({ month: m, year: y });
  };

  const handleChange = (id: number, raw: string) => {
    setValues((prev) => new Map(prev).set(id, stripFmt(raw)));
  };
  const handleFocus = (id: number) => {
    setValues((prev) => new Map(prev).set(id, stripFmt(prev.get(id) ?? "")));
  };
  const handleBlur = (id: number) => {
    const v = values.get(id) ?? "";
    setValues((prev) => new Map(prev).set(id, applyFmt(v)));
  };
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBlur(categories[idx].id);
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-plan-input]');
      inputs[idx + 1]?.focus();
    }
  };

  // savedBaseline (ref) — saqlangan "toza" holat; uni `values` (state) bilan solishtiramiz.
  // Render paytida o'qiymiz, lekin re-render'ni `values` boshqaradi, shu sabab xavfsiz.
  // eslint-disable-next-line react-hooks/refs
  const isDirty = categories.some((c) => {
    return toNum(values.get(c.id) ?? "") !== (savedBaseline.current.get(c.id) ?? 0);
  });

  const filledCount = [...values.values()].filter((v) => toNum(v) > 0).length;
  const total = [...values.values()].reduce((sum, v) => sum + toNum(v), 0);

  const onSave = () => {
    const plans = categories.map((c) => ({
      categoryId: c.id,
      amount: toNum(values.get(c.id) ?? ""),
    }));
    startSave(async () => {
      const res = await savePlansAction({ branchId: currentBranchId, year: currentYear, month: currentMonth, plans });
      if (res.ok) {
        toast.success(`${res.saved} ta reja saqlandi.`);
        savedBaseline.current = new Map(categories.map((c) => [c.id, toNum(values.get(c.id) ?? "")]));
      } else {
        toast.error(res.error);
      }
    });
  };

  const onCopyPrevMonth = () => {
    startCopy(async () => {
      const res = await loadPrevMonthPlansAction(currentBranchId, currentYear, currentMonth);
      if (!res.ok) { toast.error(res.error); return; }
      if (res.data.length === 0) {
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        toast.info(`${formatMonthName(prevMonth)} oyida reja topilmadi.`);
        return;
      }
      setValues((prev) => {
        const next = new Map(prev);
        for (const { categoryId, amount } of res.data) {
          next.set(categoryId, amount > 0 ? amount.toLocaleString("ru-RU") : "");
        }
        return next;
      });
      toast.success(`${res.data.length} ta kategoriya nusxalandi.`);
    });
  };

  const isPending = isSaving || isCopying;

  return (
    <Card className="overflow-hidden">
      {/* Header / filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between px-6 py-4 border-b bg-card">
        {/* Month navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            aria-label="Oldingi oy"
            disabled={isPending}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Select
            value={String(currentMonth)}
            onValueChange={(v) => updateUrl({ month: v ?? currentMonth })}
            disabled={isPending}
          >
            <SelectTrigger className="w-36 h-9">
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
          <Select
            value={String(currentYear)}
            onValueChange={(v) => updateUrl({ year: v ?? currentYear })}
            disabled={isPending}
          >
            <SelectTrigger className="w-24 h-9">
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
          <button
            onClick={() => navigateMonth(1)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            aria-label="Keyingi oy"
            disabled={isPending}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Branch + actions */}
        <div className="flex items-center gap-2">
          <Select
            value={String(currentBranchId)}
            onValueChange={(v) => updateUrl({ branchId: v ?? currentBranchId })}
            disabled={isPending}
          >
            <SelectTrigger className="w-44 h-9">
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

          <Button
            variant="outline"
            size="sm"
            onClick={onCopyPrevMonth}
            disabled={isPending}
            className="gap-1.5 h-9"
            title="Oldingi oy rejasidan nusxalash"
          >
            <Copy className="h-3.5 w-3.5" />
            Nusxalash
          </Button>

          <Button
            size="sm"
            onClick={onSave}
            disabled={isPending || !isDirty}
            className="h-9 relative"
          >
            {isSaving ? "Saqlanmoqda..." : "Saqlash"}
            {isDirty && !isSaving && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[oklch(0.73_0.17_48)]" />
            )}
          </Button>
        </div>
      </div>

      {/* Table */}
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Kategoriya</TableHead>
              <TableHead className="w-56 pr-6 text-right">Reja (so'm)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c, idx) => {
              const filled = toNum(values.get(c.id) ?? "") > 0;
              return (
                <TableRow
                  key={c.id}
                  className={filled ? "bg-[oklch(0.877_0.165_134/0.07)] hover:bg-[oklch(0.877_0.165_134/0.12)]" : ""}
                >
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 transition-colors ${
                          filled ? "bg-[oklch(0.72_0.18_134)]" : "bg-muted-foreground/25"
                        }`}
                      />
                      <span className="font-medium text-sm">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <Input
                      data-plan-input
                      inputMode="numeric"
                      placeholder="—"
                      value={values.get(c.id) ?? ""}
                      onChange={(e) => handleChange(c.id, e.target.value)}
                      onFocus={() => handleFocus(c.id)}
                      onBlur={() => handleBlur(c.id)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      disabled={isPending}
                      className={`text-right tabular-nums ${
                        filled ? "border-[oklch(0.877_0.165_134/0.6)]" : ""
                      }`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3.5 bg-muted/30">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span
              className={`font-medium tabular-nums ${filledCount === categories.length ? "text-[oklch(0.55_0.15_134)]" : "text-foreground"}`}
            >
              {filledCount}
            </span>
            <span>/ {categories.length} kategoriya</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Jami: </span>
            <span className="font-semibold tabular-nums">
              {total > 0 ? total.toLocaleString("ru-RU") : "—"} so'm
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
