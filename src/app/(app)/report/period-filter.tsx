"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { shiftPeriod, isFullMonthRange } from "@/lib/period";

export function PeriodFilter({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const navigate = (s: string, e: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) p.set("start", s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(e)) p.set("end", e);
    router.replace(`/report?${p.toString()}`);
  };

  const apply = () => navigate(start, end);

  const shift = (dir: 1 | -1) => {
    const next = shiftPeriod(start, end, dir);
    if (!next) return;
    setStart(next.start);
    setEnd(next.end);
    navigate(next.start, next.end);
  };

  const fullMonth = isFullMonthRange(start, end);
  const shiftLabel = fullMonth ? "oy" : "davr";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => shift(-1)}
        className="h-9 w-9 p-0"
        title={`Oldingi ${shiftLabel}`}
        aria-label={`Oldingi ${shiftLabel}`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
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
      <Button
        size="sm"
        variant="outline"
        onClick={() => shift(1)}
        className="h-9 w-9 p-0"
        title={`Keyingi ${shiftLabel}`}
        aria-label={`Keyingi ${shiftLabel}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button size="sm" onClick={apply} className="h-9 gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Ko'rish
      </Button>
    </div>
  );
}
