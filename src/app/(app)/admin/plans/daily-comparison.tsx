"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { formatUZS } from "@/lib/format";
import type { DailyPlanVsActualRow } from "@/lib/analytics";

type Branch = { id: number; name: string };

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function pctColor(p: number | null): string {
  if (p == null) return "";
  if (p >= 100) return "text-emerald-600 font-semibold";
  if (p >= 80) return "text-amber-600 font-medium";
  return "text-red-500";
}

function shiftPeriodDays(startISO: string, endISO: string, dir: 1 | -1): { start: string; end: string } {
  const s = new Date(startISO + "T00:00:00.000Z");
  const e = new Date(endISO + "T00:00:00.000Z");
  const dayMs = 86_400_000;
  const len = Math.round((e.getTime() - s.getTime()) / dayMs) + 1;
  const ns = new Date(s.getTime() + dir * len * dayMs);
  const ne = new Date(e.getTime() + dir * len * dayMs);
  return {
    start: ns.toISOString().slice(0, 10),
    end: ne.toISOString().slice(0, 10),
  };
}

export function DailyComparisonView({
  branches,
  branchId,
  start,
  end,
  rows,
}: {
  branches: Branch[];
  branchId: number | null;
  start: string;
  end: string;
  rows: DailyPlanVsActualRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/admin/plans?${p.toString()}`, { scroll: false });
  };

  const shift = (dir: 1 | -1) => {
    const next = shiftPeriodDays(start, end, dir);
    navigate({ start: next.start, end: next.end });
  };

  // Jami
  let totalPlan = 0;
  let totalActual = 0;
  let actualKnown = false;
  for (const r of rows) {
    totalPlan += r.plan;
    if (r.actual != null) {
      totalActual += r.actual;
      actualKnown = true;
    }
  }
  const totalPct = totalPlan > 0 && actualKnown ? (totalActual / totalPlan) * 100 : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Filial chiplari */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Filial
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={branchId == null ? "default" : "outline"}
                onClick={() => navigate({ branchId: undefined })}
                className="h-8 rounded-full text-xs"
              >
                Barcha filiallar
              </Button>
              {branches.map((b) => (
                <Button
                  key={b.id}
                  type="button"
                  size="sm"
                  variant={branchId === b.id ? "default" : "outline"}
                  onClick={() => navigate({ branchId: String(b.id) })}
                  className="h-8 rounded-full text-xs"
                >
                  {b.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => shift(-1)}
              className="h-9 w-9 p-0"
              title="Oldingi davr"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Boshlanish</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => navigate({ start: e.target.value })}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tugash</Label>
              <Input
                type="date"
                value={end}
                onChange={(e) => navigate({ end: e.target.value })}
                className="h-9 w-40"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => shift(1)}
              className="h-9 w-9 p-0"
              title="Keyingi davr"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Sana</TableHead>
                <TableHead className="text-right">Reja</TableHead>
                <TableHead className="text-right">Fakt</TableHead>
                <TableHead className="text-right">Farq</TableHead>
                <TableHead className="text-right w-24">Bajarish</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Tanlangan davrda ma'lumot yo'q
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const diff = r.actual != null ? r.actual - r.plan : null;
                const pct = r.actual != null && r.plan > 0 ? (r.actual / r.plan) * 100 : null;
                return (
                  <TableRow key={r.date}>
                    <TableCell className="font-mono text-xs">{fmtDate(r.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.plan > 0 ? formatUZS(r.plan) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.actual != null ? formatUZS(r.actual) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {diff != null ? (
                        <span className={diff >= 0 ? "text-emerald-600" : "text-red-500"}>
                          {diff >= 0 ? "+" : ""}
                          {formatUZS(diff)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${pctColor(pct)}`}>
                      {pct != null ? `${pct.toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {rows.length > 0 && (
              <TableBody>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Jami</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUZS(totalPlan)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {actualKnown ? formatUZS(totalActual) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {actualKnown ? (
                      <span className={totalActual - totalPlan >= 0 ? "text-emerald-600" : "text-red-500"}>
                        {totalActual - totalPlan >= 0 ? "+" : ""}
                        {formatUZS(totalActual - totalPlan)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${pctColor(totalPct)}`}>
                    {totalPct != null ? `${totalPct.toFixed(1)}%` : "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
