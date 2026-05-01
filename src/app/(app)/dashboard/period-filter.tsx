"use client";

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

type Branch = { id: number; name: string };

function fmtInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PeriodFilter({
  start,
  end,
  branchId,
  branches,
}: {
  start: string;
  end: string;
  branchId?: number;
  branches: Branch[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`/dashboard?${params.toString()}`);
  };

  const setPreset = (preset: string) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let s: Date, e: Date;
    if (preset === "today") {
      s = e = today;
    } else if (preset === "yesterday") {
      s = e = new Date(today.getTime() - 86400000);
    } else if (preset === "last7") {
      e = today;
      s = new Date(today.getTime() - 6 * 86400000);
    } else if (preset === "last30") {
      e = today;
      s = new Date(today.getTime() - 29 * 86400000);
    } else if (preset === "thisMonth") {
      s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    } else if (preset === "lastMonth") {
      s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    } else {
      return;
    }
    update({ start: fmtInput(s), end: fmtInput(e) });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="d-start">Boshlanish</Label>
            <Input
              id="d-start"
              type="date"
              value={start}
              onChange={(e) => update({ start: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-end">Tugash</Label>
            <Input
              id="d-end"
              type="date"
              value={end}
              onChange={(e) => update({ end: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Filial</Label>
            <Select
              value={branchId ? String(branchId) : "all"}
              onValueChange={(v) =>
                update({ branchId: !v || v === "all" ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreset("today")} className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors border-dashed hover:border-solid">
              Bugun
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset("last7")} className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors border-dashed hover:border-solid">
              7 kun
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset("last30")} className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors border-dashed hover:border-solid">
              30 kun
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset("thisMonth")} className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors border-dashed hover:border-solid">
              Joriy oy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset("lastMonth")} className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors border-dashed hover:border-solid">
              O'tgan oy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
