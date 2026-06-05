"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChiqimExportButton({
  params,
}: {
  params: Record<string, string | undefined>;
}) {
  const buildHref = () => {
    const p = new URLSearchParams();
    if (params.start)  p.set("start",  params.start);
    if (params.end)    p.set("end",    params.end);
    if (params.tur)    p.set("tur",    params.tur);
    if (params.filial) p.set("filial", params.filial);
    const qs = p.toString();
    return `/api/chiqim/export${qs ? `?${qs}` : ""}`;
  };

  return (
    <a
      href={buildHref()}
      download
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      )}
    >
      <Download className="h-3.5 w-3.5" />
      Eksport
    </a>
  );
}
