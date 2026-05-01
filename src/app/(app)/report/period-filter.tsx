"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

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

  const apply = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) p.set("start", start);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) p.set("end", end);
    router.replace(`/report?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
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
      <Button size="sm" onClick={apply} className="h-9 gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Ko'rish
      </Button>
    </div>
  );
}
