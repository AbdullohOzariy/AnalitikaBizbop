"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ChevronLeft, ChevronRight, Building2, Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Branch = { id: number; name: string };

function shiftDays(start: string, end: string, dir: 1 | -1): { start: string; end: string } {
  const s = new Date(start + "T00:00:00.000Z");
  const e = new Date(end + "T00:00:00.000Z");
  const dayMs = 86_400_000;
  const len = Math.round((e.getTime() - s.getTime()) / dayMs) + 1;
  return {
    start: new Date(s.getTime() + dir * len * dayMs).toISOString().slice(0, 10),
    end:   new Date(e.getTime() + dir * len * dayMs).toISOString().slice(0, 10),
  };
}

export function FiltersBar({
  branches,
  branchId,
  start,
  end,
}: {
  branches: Branch[];
  branchId: number | null;
  start: string;
  end: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === branchId) ?? null,
    [branches, branchId]
  );
  const quickBranches = useMemo(() => {
    const top = branches.slice(0, 5);
    if (!selectedBranch || top.some((b) => b.id === selectedBranch.id)) return top;
    return [selectedBranch, ...top.slice(0, 4)];
  }, [branches, selectedBranch]);

  const hrefFor = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const query = p.toString();
    return query ? `/dashboard-v2?${query}` : "/dashboard-v2";
  };
  const navigate = (changes: Record<string, string | undefined>) => {
    const href = hrefFor(changes);
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  };
  const shift = (dir: 1 | -1) => {
    const next = shiftDays(start, end, dir);
    navigate({ start: next.start, end: next.end });
  };
  const prefetchBranch = (nextBranchId: string | undefined) => {
    router.prefetch(hrefFor({ branchId: nextBranchId }));
  };

  return (
    <Card className="rounded-2xl border-border/60 bg-card shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Filial
              </Label>
              {isPending && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Yangilanmoqda
                </span>
              )}
            </div>
            <Select
              value={branchId == null ? "all" : String(branchId)}
              onValueChange={(v) => navigate({ branchId: !v || v === "all" ? undefined : v })}
              disabled={isPending}
            >
              <SelectTrigger className="h-11 w-full min-w-0 rounded-xl border-border bg-background px-3 text-sm shadow-sm focus:ring-2 focus:ring-ring/40 sm:w-80">
                <SelectValue>
                  {selectedBranch?.name ?? "Barcha filiallar"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80 rounded-xl">
                <SelectItem value="all">Barcha filiallar</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Davr navigatsiyasi */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Davr
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => shift(-1)}
                disabled={isPending}
                className="h-11 w-11 rounded-xl border-border bg-background p-0 shadow-sm"
                title="Oldingi davr"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                aria-label="Boshlanish sanasi"
                value={start}
                onChange={(e) => navigate({ start: e.target.value })}
                disabled={isPending}
                className="h-11 w-full rounded-xl border-border bg-background text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
              <span className="hidden text-muted-foreground sm:inline">–</span>
              <Input
                type="date"
                aria-label="Tugash sanasi"
                value={end}
                onChange={(e) => navigate({ end: e.target.value })}
                disabled={isPending}
                className="h-11 w-full rounded-xl border-border bg-background text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-40 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => shift(1)}
                disabled={isPending}
                className="h-11 w-11 rounded-xl border-border bg-background p-0 shadow-sm"
                title="Keyingi davr"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tezkor filial chiplari */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <button
            type="button"
            aria-pressed={branchId == null}
            onMouseEnter={() => prefetchBranch(undefined)}
            onFocus={() => prefetchBranch(undefined)}
            onClick={() => navigate({ branchId: undefined })}
            disabled={isPending}
            className={cn(
              "h-9 rounded-full px-4 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
              branchId == null
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
            )}
          >
            Barchasi
          </button>
          {quickBranches.map((b) => {
            const active = branchId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={active}
                onMouseEnter={() => prefetchBranch(String(b.id))}
                onFocus={() => prefetchBranch(String(b.id))}
                onClick={() => navigate({ branchId: String(b.id) })}
                disabled={isPending}
                className={cn(
                  "h-9 max-w-40 rounded-full px-4 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                )}
              >
                <span className="block truncate">{b.name}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
