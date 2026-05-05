"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Building2, Calendar } from "lucide-react";

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

  const navigate = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/dashboard-v2?${p.toString()}`, { scroll: false });
  };
  const shift = (dir: 1 | -1) => {
    const next = shiftDays(start, end, dir);
    navigate({ start: next.start, end: next.end });
  };

  return (
    <Card className="rounded-2xl border-none shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
      <CardContent className="pt-5 pb-5 space-y-4">
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

        <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={() => shift(-1)} className="h-9 w-9 p-0" title="Oldingi davr">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Boshlanish
            </Label>
            <Input
              type="date"
              value={start}
              onChange={(e) => navigate({ start: e.target.value })}
              className="h-9 w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Tugash
            </Label>
            <Input
              type="date"
              value={end}
              onChange={(e) => navigate({ end: e.target.value })}
              className="h-9 w-40"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => shift(1)} className="h-9 w-9 p-0" title="Keyingi davr">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
